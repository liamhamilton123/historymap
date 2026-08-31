import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import { POLITY_STATUS, DEFAULT_STATUS, UNCLAIMED, NON_STATE_PEOPLE, type PolityStatus } from '~/lib/mapStyle';

/** One row of public/data/polity-labels.json, written by the data build. */
type PolityLabel = {
  polity: string;
  /** 'polity' for ground with an owner, 'unclaimed' for ground with only a name. */
  kind: 'polity' | 'unclaimed' | 'non-state-people';
  text: string;
  color: string | null;
  status: string | null;
  from: number;
  to: number;
  anchor: [number, number];
  /** Below this zoom the polity is too small on screen to be worth naming. */
  minZoom: number;
};

const LABELS_URL = '/data/polity-labels.json';

const styleFor = (label: PolityLabel) =>
  label.kind === 'unclaimed'
    ? UNCLAIMED
    : label.kind === 'non-state-people'
      ? NON_STATE_PEOPLE
      : POLITY_STATUS[label.status as PolityStatus] ?? POLITY_STATUS[DEFAULT_STATUS];

/**
 * Held ground is named in upright type, unclaimed ground and non-state
 * peoples in italic. That is the old atlas convention — upright for what a
 * state administers, italic for what is merely a place — and it is doing real
 * work here, because the name of an unclaimed region must not be mistaken for
 * the name of an owner.
 *
 * A non-state people's name is also set in ink pulled slightly toward dim.
 * Only slightly: full ink-dim at this size under a colour wash was simply
 * unreadable, and its label is the one that has to be read *through* a polity
 * fill drawn over it. The size and weight are the compensation for that fill,
 * not a claim to rank above a state.
 */
const TYPE = {
  polity: 'text-[15px] font-semibold tracking-[0.05em] text-ink',
  unclaimed: 'text-[12px] font-medium italic tracking-[0.02em] text-ink-dim',
  'non-state-people':
    'text-[13px] font-semibold italic tracking-[0.03em] text-[color-mix(in_oklab,var(--color-ink)_70%,var(--color-ink-dim))]',
} as const;

/** Zoom levels over which a label fades in above its minZoom. */
const LABEL_FADE_ZOOM = 0.5;
/** Eases stepped zoom (scroll wheel) and time-slider changes. */
const LABEL_FADE_MS = 150;

function labelElement(label: PolityLabel): HTMLElement {
  // Two elements because MapLibre owns style.opacity on the marker element
  // (for hiding labels on the far side of the globe); the zoom fade needs an
  // opacity of its own, so it lives on an inner span.
  const element = document.createElement('span');
  // Labels are decoration over the map; they must never eat a drag or a click.
  element.className = 'pointer-events-none block';
  // No halo, plate or shadow: the names carry on colour alone, so legibility
  // is the fill palette's job rather than an effect layered over it.
  const text = document.createElement('span');
  // A long name wraps rather than sprawling across its neighbours. Balanced,
  // so a two-line label breaks near the middle instead of orphaning one word.
  text.className = 'block max-w-[16ch] text-balance text-center leading-tight ' + TYPE[label.kind];
  // A parenthesis in a polity name is a qualifier ("Golden Horde (Mongol
  // Empire)"), not part of the name itself, so it is set unbolded.
  for (const part of label.text.split(/(\([^)]*\))/)) {
    if (label.kind === 'polity' && part.startsWith('(')) {
      const qualifier = document.createElement('span');
      qualifier.className = 'font-normal';
      qualifier.textContent = part;
      text.appendChild(qualifier);
    } else if (part) {
      text.appendChild(document.createTextNode(part));
    }
  }
  text.style.transition = `opacity ${LABEL_FADE_MS}ms linear`;
  text.style.opacity = '0';
  element.appendChild(text);
  // MapLibre puts will-change:transform on every marker, which promotes each
  // label to its own compositing layer — the text is then rasterised into a
  // texture and resampled at whatever subpixel offset it lands on, which is
  // what makes marker text look soft. These labels are few and static enough
  // not to need the hint.
  element.style.willChange = 'auto';
  return element;
}

/**
 * Names the polities on screen, as DOM markers rather than a MapLibre symbol
 * layer: symbols need glyph PBFs served for a bundled font, and this site has
 * no web fonts at all — markers just use the page's own type.
 *
 * The trade is that there is no collision detection, so crowding is held off
 * with the per-label minZoom the build computes from each polity's extent.
 */
export async function attachPolityLabels(map: MapLibreMap) {
  const response = await fetch(LABELS_URL);
  if (!response.ok) throw new Error(`${response.status} fetching ${LABELS_URL}`);
  const labels: PolityLabel[] = await response.json();

  const markers = labels.map((label) => ({
    label,
    // 'top-left' is the one anchor whose transform is translate(0,0). Every
    // other one centres with a percentage, which lands on a half pixel for any
    // odd-sized element and leaves the text permanently blurred. Centring is
    // done below instead, in whole pixels.
    marker: new Marker({
      element: labelElement(label),
      anchor: 'top-left',
      // Markers are DOM overlays, so unlike map layers they need an explicit
      // covered opacity. Without it MapLibre leaves labels on the far side of
      // the globe faintly visible.
      opacity: styleFor(label).labelOpacity,
      opacityWhenCovered: 0,
    })
      .setLngLat(label.anchor)
      .addTo(map),
    centred: false,
  }));

  let instant = 0;
  const render = () => {
    const zoom = map.getZoom();
    for (const entry of markers) {
      const { label, marker } = entry;
      const element = marker.getElement();
      const inTime = label.from <= instant && label.to > instant;
      // Ramped over the zoom above minZoom rather than switched, so a label
      // grows in as its polity earns the room instead of popping.
      const opacity = inTime
        ? Math.max(0, Math.min(1, (zoom - label.minZoom) / LABEL_FADE_ZOOM))
        : 0;
      (element.firstElementChild as HTMLElement).style.opacity = String(opacity);
      // Whole pixels only, so the glyphs sit on the device grid.
      if (!entry.centred) {
        entry.centred = true;
        element.style.marginLeft = `${-Math.round(element.offsetWidth / 2)}px`;
        element.style.marginTop = `${-Math.round(element.offsetHeight / 2)}px`;
      }
    }
  };

  map.on('zoom', render);

  return {
    update(t: number) {
      instant = t;
      render();
    },
    destroy() {
      map.off('zoom', render);
      for (const { marker } of markers) marker.remove();
    },
  };
}

export type PolityLabels = Awaited<ReturnType<typeof attachPolityLabels>>;
