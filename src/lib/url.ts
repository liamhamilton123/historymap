/** The map's view lives in the URL so any state is linkable and back/forward works. */
import { clampT } from './years';
import { formatInstant, parseInstant } from './time';

export type ViewState = { t: number; lng: number; lat: number; zoom: number };

// Start with the complete world centred in the flat-map view. Individual links
// can still supply a closer camera position through the URL.
export const DEFAULT_VIEW: ViewState = { t: 2026, lng: 0, lat: 20, zoom: 0.8 };

export function readView(): ViewState {
  if (typeof window === 'undefined') return DEFAULT_VIEW;
  const params = new URLSearchParams(window.location.search);
  const num = (key: string, fallback: number) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && params.has(key) ? value : fallback;
  };
  // `t` is an ISO date, so a link can point at a day as easily as at a year.
  const t = params.get('t');
  const parsed = t === null ? null : parseInstant(t);
  return {
    t: clampT(parsed ?? DEFAULT_VIEW.t),
    lng: num('lng', DEFAULT_VIEW.lng),
    lat: num('lat', DEFAULT_VIEW.lat),
    zoom: num('zoom', DEFAULT_VIEW.zoom),
  };
}

let pending = 0;

function urlFor(view: ViewState): string {
  const params = new URLSearchParams(window.location.search);
  params.set('t', formatInstant(view.t));
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
