import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
// MapLibre resolves its worker relative to its own module URL, which no
// bundler preserves — the request 404s and the map renders nothing at all,
// with no error beyond a failed fetch. Letting Vite bundle the worker and
// handing MapLibre the resulting URL is the supported fix.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import '~/styles/map.css';

import { buildStyle } from '~/lib/mapStyle';
import { useMapStore } from '~/lib/store';
import { readView, pushView, writeView } from '~/lib/url';
import { hasWebGL2 } from '~/lib/webgl';
import Timeline from './Timeline';
import MapControls from './MapControls';
import MapUnavailable from './MapUnavailable';

export default function HistoryMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState<'webgl' | 'init' | null>(null);
  const restoringHistory = useRef(false);

  const globe = useMapStore((state) => state.globe);
  const year = useMapStore((state) => state.year);

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
        style: buildStyle(),
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
    useMapStore.getState().setYear(view.year);

    // Surface style/source failures. Without this MapLibre swallows them into
    // an unhandled 'error' event and the map just stays empty.
    instance.on('error', (event) => console.error('[atlas] map error:', event.error ?? event));
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__map = instance;

    instance.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    instance.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');

    const currentView = () => {
      const center = instance.getCenter();
      return {
        year: useMapStore.getState().year,
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
      useMapStore.getState().setYear(restored.year);
      requestAnimationFrame(() => {
        restoringHistory.current = false;
      });
    };

    instance.on('movestart', beginMapHistory);
    instance.on('moveend', syncUrl);
    window.addEventListener('atlas:history-start', beginMapHistory);
    window.addEventListener('popstate', restoreFromHistory);

    return () => {
      instance.off('movestart', beginMapHistory);
      instance.off('moveend', syncUrl);
      window.removeEventListener('atlas:history-start', beginMapHistory);
      window.removeEventListener('popstate', restoreFromHistory);
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || restoringHistory.current) return;
    const center = map.current.getCenter();
    writeView({ year, lng: center.lng, lat: center.lat, zoom: map.current.getZoom() });
  }, [year]);

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
    <div className="map-root">
      <div ref={container} className="map-canvas" />
      <MapControls />
      <Timeline />
    </div>
  );
}
