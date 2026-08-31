import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  ScaleControl,
  setWorkerUrl,
  type MapMouseEvent,
} from 'maplibre-gl';
// MapLibre resolves its worker relative to its own module URL, which no
// bundler preserves — the request 404s and the map renders nothing at all,
// with no error beyond a failed fetch. Letting Vite bundle the worker and
// handing MapLibre the resulting URL is the supported fix.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  buildStyle,
  selectionFilter,
  TIMED_LAYERS,
  UNCLAIMED_FILL,
  POLITY_STATUS,
  STATIC_HATCHES,
  SELECTED_LAYER,
  type PolityHatch,
} from '~/lib/mapStyle';
import { hatchImage, hexToRgb, HATCH_PIXEL_RATIO } from '~/lib/hatch';
import { attachPolityLabels, type PolityLabels } from './polityLabels';
import { useMapStore } from '~/lib/store';
import { readView, pushView, writeView } from '~/lib/url';
import { hasWebGL2 } from '~/lib/webgl';
import Timeline from './Timeline';
import MapControls from './MapControls';
import MapUnavailable from './MapUnavailable';
import PolityInfo, { type PolitySelection } from './PolityInfo';

const MAX_VIEW_WIDTH_METERS = 750_000;
const EARTH_CIRCUMFERENCE_METERS = 40_075_016.68557849;
const MAP_TILE_SIZE = 512;

function systemColorScheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Convert a 750 km horizontal view into a MapLibre zoom for this viewport. */
function maxZoomForViewWidth(width: number, latitude: number) {
  const latitudeScale = Math.cos((latitude * Math.PI) / 180);
  const zoom = Math.log2(
    (width * EARTH_CIRCUMFERENCE_METERS * latitudeScale) /
      (MAP_TILE_SIZE * MAX_VIEW_WIDTH_METERS),
  );
  return Math.min(22, Math.max(0.8, zoom));
}

const HATCHES_URL = '/data/polity-hatches.json';

/**
 * The stripe patterns for ground more than one polity claims. Fetched once and
 * reused, because a style reload — which is what a light/dark switch is —
 * empties the image registry and needs them all over again.
 */
let contestedHatches: Promise<PolityHatch[]> | null = null;
function loadContestedHatches(): Promise<PolityHatch[]> {
  contestedHatches ??= fetch(HATCHES_URL).then((response) => {
    if (!response.ok) throw new Error(`${response.status} fetching ${HATCHES_URL}`);
    return response.json();
  });
  return contestedHatches;
}

/**
 * Register the stripe patterns the hatched statuses reference. Has to happen
 * before the style is drawn, or fill-pattern resolves to a missing image and
 * those layers render nothing at all.
 */
function registerHatches(instance: MapLibreMap) {
  for (const { imageId, hatch } of STATIC_HATCHES) {
    if (instance.hasImage(imageId)) continue;
    instance.addImage(imageId, hatchImage(hatch), { pixelRatio: HATCH_PIXEL_RATIO });
  }
  // Contested ground needs one image per claimant's colour, and only the data
  // knows which colours those are. This settles after the style has drawn;
  // adding an image late simply repaints the layer that was waiting on it.
  loadContestedHatches()
    .then((rows) => {
      for (const { id, status, color, claim } of rows) {
        const spec = POLITY_STATUS[status]?.hatch;
        if (!spec || instance.hasImage(id)) continue;
        instance.addImage(
          id,
          // Opposite leans are what let two claimants read through each other
          // rather than the one drawn second hiding the one drawn first.
          hatchImage(spec, { color: hexToRgb(color), slope: claim % 2 === 0 ? 1 : -1 }),
          { pixelRatio: HATCH_PIXEL_RATIO },
        );
      }
    })
    .catch((error) => {
      // A torn-down map throws from hasImage; that is not worth reporting.
      console.error('[atlas] contested stripe patterns failed', error);
    });
}

/** The layers clicks are tested against: between them the two fills cover every
 *  piece of ground on screen, held or not, and hatches and outlines only ever
 *  sit on top of one of them. */
const PICK_LAYERS = ['polity-fill', UNCLAIMED_FILL];

/** Show only the ground that existed at `t`, held or not. */
function applyInstant(instance: MapLibreMap, t: number) {
  for (const layer of TIMED_LAYERS) instance.setFilter(layer.id, layer.filter(t));
}

/** Outline the selected polity, or nothing when the panel is closed. */
function applySelection(instance: MapLibreMap, t: number, polity: string | null) {
  instance.setFilter(SELECTED_LAYER, selectionFilter(t, polity));
}

export default function HistoryMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState<'webgl' | 'init' | null>(null);
  const [atMaxZoom, setAtMaxZoom] = useState(false);
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(() =>
    typeof window === 'undefined' ? 'dark' : systemColorScheme(),
  );
  const restoringHistory = useRef(false);
  const [selection, setSelection] = useState<PolitySelection | null>(null);
  // The click handler is registered once, so it cannot read the state above.
  const selected = useRef<string | null>(null);

  const globe = useMapStore((state) => state.globe);
  const t = useMapStore((state) => state.t);
  const styleReady = useRef(false);
  const labels = useRef<PolityLabels | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;

    // Probing beats catching: MapLibre logs a GPUInitializationError and then
    // dies asynchronously, which is impossible to recover from cleanly.
    if (!hasWebGL2()) {
      setFailed('webgl');
      return;
    }

    setWorkerUrl(maplibreWorkerUrl);

    const view = readView();
    const maxZoom = maxZoomForViewWidth(container.current.clientWidth, view.lat);
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: buildStyle(view.t, systemColorScheme()),
        center: [view.lng, view.lat],
        zoom: view.zoom,
        minZoom: 0.8,
        maxZoom,
        // Rotation is noise on this kind of map; dragging should pan, always.
        dragRotate: false,
        pitchWithRotate: false,
        // A pan must never open the info panel. MapLibre only fires 'click'
        // when the pointer stayed within this many pixels between press and
        // release, so panning and clicking stay cleanly separate without the
        // handler having to track the drag itself.
        clickTolerance: 4,
        attributionControl: false,
      });
    } catch (error) {
      console.error('[atlas] map failed to initialise', error);
      setFailed('init');
      return;
    }
    map.current = instance;
    useMapStore.getState().setT(view.t);

    // setFilter throws until the style exists, so gate on it and re-apply once.
    instance.on('style.load', () => {
      styleReady.current = true;
      registerHatches(instance);
      applyInstant(instance, useMapStore.getState().t);
      applySelection(instance, useMapStore.getState().t, selected.current);
    });

    // One handler for both opening and closing: a click that lands on a polity
    // selects it, and a click that lands anywhere else dismisses the panel,
    // which is what clicking away from a thing is expected to do.
    const handleClick = (event: MapMouseEvent) => {
      const layers = PICK_LAYERS.filter((id) => instance.getLayer(id));
      if (!layers.length) return;
      const hits = instance.queryRenderedFeatures(event.point, { layers });
      const [feature] = hits;
      if (!feature) return setSelection(null);
      const properties = feature.properties as PolitySelection;
      // Contested ground carries a feature per claimant, all of them under the
      // pointer at once, so the panel can say who else claims it rather than
      // silently picking whichever happened to be drawn on top.
      const rivals = [
        ...new Set(
          hits
            .filter((hit) => hit.properties.polity !== properties.polity)
            .filter((hit) => hit.properties.status === 'contested')
            .map((hit) => hit.properties.name as string),
        ),
      ];
      setSelection({ ...properties, rivals });
    };
    // Hovering a polity has to look clickable, but only over the polities —
    // the ocean is still just something to drag.
    const enterPolity = () => {
      instance.getCanvas().style.cursor = 'pointer';
    };
    const leavePolity = () => {
      instance.getCanvas().style.cursor = '';
    };
    instance.on('click', handleClick);
    for (const layer of PICK_LAYERS) {
      instance.on('mouseenter', layer, enterPolity);
      instance.on('mouseleave', layer, leavePolity);
    }

    let cancelled = false;
    attachPolityLabels(instance)
      .then((attached) => {
        // The island can unmount before the fetch settles; tear down rather
        // than leaving markers bound to a removed map.
        if (cancelled) return attached.destroy();
        labels.current = attached;
        attached.update(useMapStore.getState().t);
      })
      .catch((error) => console.error('[atlas] polity labels failed to load', error));

    // The island can mount before Vite has applied the global Tailwind sheet.
    // MapLibre snapshots its canvas size during construction, so observe the
    // container and resize once layout settles (and on future viewport changes).
    const updateMaxZoom = () => {
      const width = container.current?.clientWidth ?? 0;
      if (width > 0) instance.setMaxZoom(maxZoomForViewWidth(width, instance.getCenter().lat));
      setAtMaxZoom(instance.getZoom() >= instance.getMaxZoom() - 0.01);
    };
    const resizeObserver = new ResizeObserver(() => {
      instance.resize();
      updateMaxZoom();
    });
    resizeObserver.observe(container.current);

    // Surface style/source failures. Without this MapLibre swallows them into
    // an unhandled 'error' event and the map just stays empty.
    instance.on('error', (event) => console.error('[atlas] map error:', event.error ?? event));
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__map = instance;
      console.info('[atlas] map initialising', {
        view,
        canvasSize: { width: container.current.clientWidth, height: container.current.clientHeight },
        webgl2: hasWebGL2(),
      });
      instance.on('style.load', () => {
        console.info('[atlas] style loaded', {
          layers: instance.getStyle().layers?.map((layer) => layer.id),
          source: instance.getSource('basemap') ? 'registered' : 'missing',
        });
      });
      instance.on('sourcedataloading', (event) => {
        if (event.sourceId === 'basemap') console.info('[atlas] basemap source loading');
      });
      instance.on('sourcedata', (event) => {
        if (event.sourceId === 'basemap') {
          console.info('[atlas] basemap source data event', {
            sourceLoaded: event.isSourceLoaded,
            dataType: event.dataType,
          });
        }
      });
      instance.on('idle', () => {
        const features = instance.querySourceFeatures('basemap');
        console.info('[atlas] map idle', {
          zoom: instance.getZoom(),
          center: instance.getCenter().toArray(),
          basemapFeaturesInLoadedTiles: features.length,
          canvasSize: { width: container.current?.clientWidth, height: container.current?.clientHeight },
        });
      });
    }

    instance.addControl(new ScaleControl({ unit: 'metric' }), 'top-right');

    const currentView = () => {
      const center = instance.getCenter();
      return {
        t: useMapStore.getState().t,
        lng: center.lng,
        lat: center.lat,
        zoom: instance.getZoom(),
      };
    };
    const beginMapHistory = () => {
      if (!restoringHistory.current) pushView(currentView());
    };
    const syncUrl = () => {
      if (!restoringHistory.current) writeView(currentView());
    };
    const restoreFromHistory = () => {
      const restored = readView();
      restoringHistory.current = true;
      instance.jumpTo({ center: [restored.lng, restored.lat], zoom: restored.zoom });
      useMapStore.getState().setT(restored.t);
      requestAnimationFrame(() => {
        restoringHistory.current = false;
      });
    };

    instance.on('movestart', beginMapHistory);
    instance.on('moveend', syncUrl);
    instance.on('moveend', updateMaxZoom);
    instance.on('zoomend', updateMaxZoom);
    window.addEventListener('atlas:history-start', beginMapHistory);
    window.addEventListener('popstate', restoreFromHistory);

    return () => {
      cancelled = true;
      instance.off('click', handleClick);
      for (const layer of PICK_LAYERS) {
        instance.off('mouseenter', layer, enterPolity);
        instance.off('mouseleave', layer, leavePolity);
      }
      labels.current?.destroy();
      labels.current = null;
      styleReady.current = false;
      resizeObserver.disconnect();
      instance.off('movestart', beginMapHistory);
      instance.off('moveend', syncUrl);
      instance.off('moveend', updateMaxZoom);
      instance.off('zoomend', updateMaxZoom);
      window.removeEventListener('atlas:history-start', beginMapHistory);
      window.removeEventListener('popstate', restoreFromHistory);
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const updateScheme = () => setColorScheme(query.matches ? 'light' : 'dark');
    updateScheme();
    query.addEventListener('change', updateScheme);
    return () => query.removeEventListener('change', updateScheme);
  }, []);

  useEffect(() => {
    if (!map.current) return;
    styleReady.current = false;
    map.current.setStyle(buildStyle(useMapStore.getState().t, colorScheme));
  }, [colorScheme]);

  useEffect(() => {
    if (!map.current) return;
    if (styleReady.current) applyInstant(map.current, t);
    labels.current?.update(t);
    // A span the map is no longer showing must not keep a panel open over it.
    if (selection && (t < selection.from || t >= selection.to)) setSelection(null);
    if (restoringHistory.current) return;
    const center = map.current.getCenter();
    writeView({ t, lng: center.lng, lat: center.lat, zoom: map.current.getZoom() });
  }, [t]);

  useEffect(() => {
    selected.current = selection?.polity ?? null;
    if (map.current && styleReady.current) applySelection(map.current, t, selected.current);
  }, [selection, t]);

  useEffect(() => {
    if (!selection) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [selection]);

  useEffect(() => {
    if (!map.current) return;
    try {
      map.current.setProjection({ type: globe ? 'globe' : 'mercator' });
    } catch {
      // Older MapLibre builds have no globe; mercator is a fine fallback.
    }
  }, [globe]);

  if (failed) return <MapUnavailable reason={failed} />;

  return (
    <div className="fixed inset-0 h-dvh w-screen overflow-hidden">
      <div
        ref={container}
        className="absolute inset-0"
        // MapLibre measures this element synchronously. Keep its dimensions
        // available even before a client-only island's stylesheet settles.
        style={{ width: '100vw', height: '100vh' }}
      />
      <a
        href="/"
        className="absolute top-4 left-4 z-[5] inline-flex size-10 items-center justify-center rounded-xl border border-ink/12 bg-panel/55 text-ink shadow-panel backdrop-blur-[8px] backdrop-saturate-[140%] transition-colors hover:border-ink/20 hover:bg-panel/75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        aria-label="Close map and return home"
        title="Close map"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="m3 3 10 10M13 3 3 13" strokeLinecap="round" />
        </svg>
      </a>
      {selection && <PolityInfo selection={selection} onClose={() => setSelection(null)} />}
      <MapControls
        onZoomIn={() => map.current?.zoomIn({ duration: 180 })}
        onZoomOut={() => map.current?.zoomOut({ duration: 180 })}
        canZoomIn={!atMaxZoom}
      />
      <Timeline />
    </div>
  );
}
