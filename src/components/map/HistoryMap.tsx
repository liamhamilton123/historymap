import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
// MapLibre resolves its worker relative to its own module URL, which no
// bundler preserves — the request 404s and the map renders nothing at all,
// with no error beyond a failed fetch. Letting Vite bundle the worker and
// handing MapLibre the resulting URL is the supported fix.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

import { buildStyle, polityFilter, POLITY_LAYERS } from '~/lib/mapStyle';
import { useMapStore } from '~/lib/store';
import { readView, pushView, writeView } from '~/lib/url';
import { hasWebGL2 } from '~/lib/webgl';
import Timeline from './Timeline';
import MapControls from './MapControls';
import MapUnavailable from './MapUnavailable';

/** Show only the polities that existed at `t`. */
function applyInstant(instance: MapLibreMap, t: number) {
  for (const layer of POLITY_LAYERS) instance.setFilter(layer.id, polityFilter(t, layer.status));
}

export default function HistoryMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState<'webgl' | 'init' | null>(null);
  const restoringHistory = useRef(false);

  const globe = useMapStore((state) => state.globe);
  const t = useMapStore((state) => state.t);
  const styleReady = useRef(false);

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
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: buildStyle(view.t),
        center: [view.lng, view.lat],
        zoom: view.zoom,
        minZoom: 0.8,
        maxZoom: 10,
        // Rotation is noise on this kind of map; dragging should pan, always.
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
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
      applyInstant(instance, useMapStore.getState().t);
    });

    // The island can mount before Vite has applied the global Tailwind sheet.
    // MapLibre snapshots its canvas size during construction, so observe the
    // container and resize once layout settles (and on future viewport changes).
    const resizeObserver = new ResizeObserver(() => instance.resize());
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

    instance.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');

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
    window.addEventListener('atlas:history-start', beginMapHistory);
    window.addEventListener('popstate', restoreFromHistory);

    return () => {
      styleReady.current = false;
      resizeObserver.disconnect();
      instance.off('movestart', beginMapHistory);
      instance.off('moveend', syncUrl);
      window.removeEventListener('atlas:history-start', beginMapHistory);
      window.removeEventListener('popstate', restoreFromHistory);
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    if (styleReady.current) applyInstant(map.current, t);
    if (restoringHistory.current) return;
    const center = map.current.getCenter();
    writeView({ t, lng: center.lng, lat: center.lat, zoom: map.current.getZoom() });
  }, [t]);

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
        className="absolute top-4 left-4 z-[5] inline-flex size-10 items-center justify-center rounded-xl border border-white/9 bg-panel/82 text-ink shadow-panel backdrop-blur-[18px] backdrop-saturate-[140%] transition-colors hover:border-white/16 hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        aria-label="Close map and return home"
        title="Close map"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="m3 3 10 10M13 3 3 13" strokeLinecap="round" />
        </svg>
      </a>
      <MapControls
        onZoomIn={() => map.current?.zoomIn({ duration: 180 })}
        onZoomOut={() => map.current?.zoomOut({ duration: 180 })}
      />
      <Timeline />
    </div>
  );
}
