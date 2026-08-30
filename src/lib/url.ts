/** The map's view lives in the URL so any state is linkable and back/forward works. */
import { MAX_YEAR, MIN_YEAR } from './years';

export type ViewState = { year: number; lng: number; lat: number; zoom: number };

export const DEFAULT_VIEW: ViewState = { year: 1980, lng: 15, lat: 30, zoom: 1.9 };

export function readView(): ViewState {
  if (typeof window === 'undefined') return DEFAULT_VIEW;
  const params = new URLSearchParams(window.location.search);
  const num = (key: string, fallback: number) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && params.has(key) ? value : fallback;
  };
  return {
    year: Math.min(Math.max(num('year', DEFAULT_VIEW.year), MIN_YEAR), MAX_YEAR),
    lng: num('lng', DEFAULT_VIEW.lng),
    lat: num('lat', DEFAULT_VIEW.lat),
    zoom: num('zoom', DEFAULT_VIEW.zoom),
  };
}

let pending = 0;

function urlFor(view: ViewState): string {
  const params = new URLSearchParams(window.location.search);
  params.set('year', String(Math.round(view.year)));
  params.set('lng', view.lng.toFixed(3));
  params.set('lat', view.lat.toFixed(3));
  params.set('zoom', view.zoom.toFixed(2));
  return `${window.location.pathname}?${params}`;
}

/** Coalesced replacement for continuous updates such as playback and dragging. */
export function writeView(view: ViewState) {
  if (typeof window === 'undefined') return;
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    window.history.replaceState(null, '', urlFor(view));
  });
}

/** Start a new history entry before a user begins a distinct map interaction. */
export function pushView(view: ViewState) {
  if (typeof window === 'undefined') return;
  cancelAnimationFrame(pending);
  window.history.pushState(null, '', urlFor(view));
}
