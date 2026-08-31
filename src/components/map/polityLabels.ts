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
/** Minimum screen-pixel gap between two labels before one must yield. */
const LABEL_COLLISION_PADDING = 4;
/** How far around a label a click still counts as clicking the label. */
const LABEL_PICK_MARGIN = 8;

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
 * Crowding is held off two ways: the per-label minZoom the build computes
 * from each polity's extent, and a screen-space collision pass on render that
 * hides the less important of two labels whose boxes overlap. Anchors spread
 * apart in pixels as the map zooms in, so a hidden label returns by itself
 * once there is room for it.
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
    halfWidth: 0,
    halfHeight: 0,
    // The label's screen box while it is actually visible, for click picking.
    pickBox: null as { x1: number; y1: number; x2: number; y2: number } | null,
  }));

  // Collisions are resolved in importance order: held ground always outranks
  // a people or an unclaimed region, and within a kind the label of the
  // larger polity (lower minZoom) keeps its place while the smaller one
  // yields. The order is fixed, so the outcome never flickers between frames.
  const KIND_RANK = { polity: 0, 'non-state-people': 1, unclaimed: 2 } as const;
  const byImportance = [...markers].sort(
    (a, b) =>
      KIND_RANK[a.label.kind] - KIND_RANK[b.label.kind] || a.label.minZoom - b.label.minZoom,
  );

  let instant = 0;
  const render = () => {
    const zoom = map.getZoom();
    // Screen boxes of the labels placed so far this frame, for collision.
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const entry of byImportance) {
      const { label, marker } = entry;
      const element = marker.getElement();
      const inTime = label.from <= instant && label.to > instant;
      // Ramped over the zoom above minZoom rather than switched, so a label
      // grows in as its polity earns the room instead of popping.
      let opacity = inTime
        ? Math.max(0, Math.min(1, (zoom - label.minZoom) / LABEL_FADE_ZOOM))
        : 0;
      entry.pickBox = null;
      if (opacity > 0) {
        // Whole pixels only, so the glyphs sit on the device grid.
        if (!entry.centred) {
          entry.centred = true;
          entry.halfWidth = element.offsetWidth / 2;
          entry.halfHeight = element.offsetHeight / 2;
          element.style.marginLeft = `${-Math.round(entry.halfWidth)}px`;
          element.style.marginTop = `${-Math.round(entry.halfHeight)}px`;
        }
        const { x, y } = map.project(label.anchor);
        const box = {
          x1: x - entry.halfWidth - LABEL_COLLISION_PADDING,
          y1: y - entry.halfHeight - LABEL_COLLISION_PADDING,
          x2: x + entry.halfWidth + LABEL_COLLISION_PADDING,
          y2: y + entry.halfHeight + LABEL_COLLISION_PADDING,
        };
        const collides = placed.some(
          (p) => box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1,
        );
        // A label on the far side of the globe is invisible; it must not
        // reserve ground that would hide a label the viewer can see, nor may
        // it be clicked.
        if (collides) opacity = 0;
        else if (element.style.opacity !== '0') {
          placed.push(box);
          entry.pickBox = box;
        }
      }
      (element.firstElementChild as HTMLElement).style.opacity = String(opacity);
    }
  };

  // 'move' rather than 'zoom': on the globe, panning also changes how far
  // apart two anchors land on screen, so collisions must be re-judged.
  map.on('move', render);

  return {
    update(t: number) {
      instant = t;
      render();
    },
    /**
     * The visible label at (or within LABEL_PICK_MARGIN of) a screen point,
     * nearest first if the margins of two labels overlap. A click on a name
     * belongs to the named entity even when another polity's fill is drawn
     * over that ground — the caller resolves the click through this before
     * asking the fill layers.
     */
    pick(point: { x: number; y: number }): PolityLabel | null {
      let best: PolityLabel | null = null;
      let bestDistance = Infinity;
      for (const entry of markers) {
        const box = entry.pickBox;
        if (!box) continue;
        if (
          point.x < box.x1 - LABEL_PICK_MARGIN ||
          point.x > box.x2 + LABEL_PICK_MARGIN ||
          point.y < box.y1 - LABEL_PICK_MARGIN ||
          point.y > box.y2 + LABEL_PICK_MARGIN
        )
          continue;
        const dx = point.x - (box.x1 + box.x2) / 2;
        const dy = point.y - (box.y1 + box.y2) / 2;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = entry.label;
        }
      }
      return best;
    },
    destroy() {
      map.off('move', render);
      for (const { marker } of markers) marker.remove();
    },
  };
}

export type PolityLabels = Awaited<ReturnType<typeof attachPolityLabels>>;
