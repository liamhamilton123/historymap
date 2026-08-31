import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import { POLITY_STATUS, DEFAULT_STATUS, UNCLAIMED, type PolityStatus } from '~/lib/mapStyle';

/** One row of public/data/polity-labels.json, written by the data build. */
type PolityLabel = {
  polity: string;
  /** 'polity' for ground with an owner, 'unclaimed' for ground with only a name. */
  kind: 'polity' | 'unclaimed';
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
    : POLITY_STATUS[label.status as PolityStatus] ?? POLITY_STATUS[DEFAULT_STATUS];

/**
 * Held ground is named in upright capitals, unclaimed ground in italic. That is
 * the old atlas convention — upright for what a state administers, italic for
 * what is merely a place — and it is doing real work here, because the name of
 * an unclaimed region must not be mistaken for the name of an owner.
 */
const TYPE = {
  polity: 'font-semibold tracking-[0.05em] uppercase text-ink',
  unclaimed: 'font-medium italic tracking-[0.02em] text-ink-dim',
} as const;

function labelElement(label: PolityLabel): HTMLElement {
  const element = document.createElement('span');
  // Labels are decoration over the map; they must never eat a drag or a click.
  // No halo, plate or shadow: the names carry on colour alone, so legibility
  // is the fill palette's job rather than an effect layered over it.
  element.className =
    'pointer-events-none block whitespace-nowrap text-[12px] ' + TYPE[label.kind];
  element.textContent = label.text;
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
      const visible = label.from <= instant && label.to > instant && zoom >= label.minZoom;
      if (!visible) {
        element.style.display = 'none';
        continue;
      }
      element.style.display = '';
      // Measured on first show, because a hidden element has no size. Whole
      // pixels only, so the glyphs sit on the device grid.
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
