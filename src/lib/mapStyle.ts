import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { POLITY_COLOR, type HatchSpec } from './hatch';

type ColorScheme = 'light' | 'dark';

const COLORS: Record<ColorScheme, {
  ocean: string;
  land: string;
  landStroke: string;
  water: string;
  river: string;
  sky: string;
  horizon: string;
  select: string;
  unclaimed: string;
}> = {
  dark: {
    ocean: '#0b1a26', land: '#222c38', landStroke: 'rgba(150, 175, 200, 0.22)',
    water: '#0d2231', river: 'rgba(120, 170, 210, 0.35)', sky: '#0a1620', horizon: '#16303f',
    select: '#e0b872',
    unclaimed: '#93a7b4',
  },
  light: {
    ocean: '#dbe8ed', land: '#d5d2c7', landStroke: 'rgba(66, 84, 91, 0.34)',
    water: '#c8dfe8', river: 'rgba(67, 126, 157, 0.52)', sky: '#c8e0ea', horizon: '#e8f0ed',
    select: '#8a6124',
    unclaimed: '#69767d',
  },
};

/**
 * How a span is drawn, by its `status`. This is the whole vocabulary: add an
 * entry and it gets its own outline layer, its own fill opacity and its own
 * validation in the data build. Nothing about a status is written per feature,
 * so every disputed territory on the map looks the same by construction.
 *
 * The keys are mirrored by STATUSES in data/scripts/build-polities.mjs, which
 * rejects any span using a status that is not defined here.
 */
export const POLITY_STATUS = {
  /** Held, and not seriously contested. */
  controlled: {
    title: 'Controlled',
    fillOpacity: 0.45,
    hatch: null,
    lineOpacity: 0.9,
    lineWidth: 1,
    lineDash: null,
    labelOpacity: 1,
  },
  /** Held in fact, but the claim is rejected — occupation, annexation, secession. */
  disputed: {
    title: 'Disputed',
    fillOpacity: 0.3,
    // Neutral stripes over the polity's own colour, so the treatment reads the
    // same whoever holds the ground. A coloured hatch would need one pattern
    // image per polity, since fill-pattern cannot be tinted per feature.
    hatch: { size: 8, period: 4, thickness: 1.4, color: [255, 255, 255], opacity: 0.5 },
    lineOpacity: 1,
    lineWidth: 1.3,
    lineDash: [2, 1.6],
    labelOpacity: 0.72,
  },
  /**
   * Claimed by more than one polity at once — joint occupation, or a frontier
   * two states each consider theirs. Where `disputed` is one holder whose claim
   * others reject, this is ground that genuinely carries a feature per
   * claimant, stacked on top of each other.
   *
   * That is why it gets no fill: two translucent fills would blend into a
   * third colour belonging to neither claimant. The claimants read as stripes
   * in their own colours instead, leaning opposite ways so both show through.
   * An invisible fill is still a clickable one, which is what keeps the info
   * panel working over contested ground.
   */
  contested: {
    title: 'Contested',
    fillOpacity: 0,
    hatch: { size: 10, period: 5, thickness: 1.8, color: POLITY_COLOR, opacity: 0.85 },
    lineOpacity: 0.85,
    lineWidth: 1,
    lineDash: [1.5, 2.5],
    labelOpacity: 0.85,
  },
} as const satisfies Record<string, StatusStyle>;

/**
 * Ground that no polity held, named anyway. Deliberately not a status: a status
 * says how an owner holds something, and here there is no owner. That is also
 * why its colour comes from the theme rather than from the feature — colour on
 * this map means identity, and an unclaimed region has none to show.
 *
 * It keeps a faint fill so it still reads as ground and stays clickable, and a
 * dotted outline, which is the old convention for a limit nobody agreed on.
 */
export const UNCLAIMED = {
  title: 'Unclaimed',
  fillOpacity: 0.1,
  lineOpacity: 0.55,
  lineWidth: 1,
  lineDash: [1, 2.2],
  labelOpacity: 0.9,
} as const;

export const UNCLAIMED_FILL = 'unclaimed-fill';
export const UNCLAIMED_LINE = 'unclaimed-line';

type StatusStyle = {
  /** How the status is named to the reader, in the info panel. */
  title: string;
  fillOpacity: number;
  /** Diagonal stripes drawn over the fill, or null for a plain fill. */
  hatch: HatchSpec | null;
  lineOpacity: number;
  lineWidth: number;
  lineDash: readonly number[] | null;
  /** Dims the name of a polity whose hold on the ground is contested. */
  labelOpacity: number;
};

export type PolityStatus = keyof typeof POLITY_STATUS;

/** What a span without an explicit status means. */
export const DEFAULT_STATUS: PolityStatus = 'controlled';

/**
 * The layers whose visible features depend on the current instant. Outlines are
 * one layer per status because line-dasharray cannot be driven by a feature
 * property; the fill can, so it stays a single layer.
 */
const HATCHED = (Object.entries(POLITY_STATUS) as [PolityStatus, StatusStyle][])
  .filter(([, style]) => style.hatch)
  .map(([status, style]) => ({ status, hatch: style.hatch! }));

/**
 * Statuses whose stripes are one fixed image, registered once at startup.
 */
export const STATIC_HATCHES = HATCHED.filter(({ hatch }) => hatch.color !== POLITY_COLOR).map(
  ({ status, hatch }) => ({ status, hatch, imageId: `hatch-${status}` }),
);

/**
 * Statuses whose stripes take the polity's own colour. One image is needed per
 * colour and lean actually present in the data, so the image is chosen per
 * feature from the `hatch` property, and the build lists what to register in
 * polity-hatches.json — only the data knows which colours occur.
 */
export const POLITY_HATCHES = HATCHED.filter(({ hatch }) => hatch.color === POLITY_COLOR);

/** One row of public/data/polity-hatches.json, written by the data build. */
export type PolityHatch = {
  /** The image id, which is also the `hatch` property on the features using it. */
  id: string;
  status: PolityStatus;
  color: string;
  /** Which claimant this is on its piece of ground; decides the stripes' lean. */
  claim: number;
};

/**
 * Every layer whose visible features depend on the current instant. Each one
 * carries the filter to re-apply, because the two kinds of ground on the map
 * are selected differently and the caller should not have to know which is
 * which.
 */
export const TIMED_LAYERS: { id: string; filter: (t: number) => FilterSpecification }[] = [
  { id: 'polity-fill', filter: (t) => polityFilter(t) },
  ...HATCHED.map(({ status }) => ({
    id: `polity-hatch-${status}`,
    filter: (t: number) => polityFilter(t, status),
  })),
  ...(Object.keys(POLITY_STATUS) as PolityStatus[]).map((status) => ({
    id: `polity-line-${status}`,
    filter: (t: number) => polityFilter(t, status),
  })),
  { id: UNCLAIMED_FILL, filter: unclaimedFilter },
  { id: UNCLAIMED_LINE, filter: unclaimedFilter },
];

/** The outline drawn around whichever polity the reader has clicked. */
export const SELECTED_LAYER = 'polity-selected';

/**
 * The selection outline covers every span of the clicked polity that exists at
 * `t` — a polity holding contested ground alongside controlled ground is one
 * thing to the reader, so it highlights as one thing.
 */
export function selectionFilter(t: number, polity: string | null): FilterSpecification {
  // Nothing selected still needs a filter that matches nothing: a layer with
  // no filter at all would outline every polity on the map.
  if (!polity) return ['boolean', false] as FilterSpecification;
  return [
    'all',
    ['<=', ['get', 'from'], t],
    ['>', ['get', 'to'], t],
    ['==', ['get', 'polity'], polity],
  ] as FilterSpecification;
}

/**
 * A polity feature is on screen for exactly the span it existed. This one
 * expression is the whole time model at runtime — there is nothing to join.
 */
export function polityFilter(t: number, status?: PolityStatus): FilterSpecification {
  const clauses: ExpressionSpecification[] = [
    ['<=', ['get', 'from'], t],
    ['>', ['get', 'to'], t],
    // Unclaimed ground shares the source file but must never reach a layer
    // that colours by owner, because it has no owner and so no colour.
    ['==', ['get', 'kind'], 'polity'],
  ];
  if (status) clauses.push(['==', ['get', 'status'], status]);
  // Spreading defeats the tuple inference the style spec's filter type wants.
  return ['all', ...clauses] as FilterSpecification;
}

/** The same span of time, for the ground nobody held. */
export function unclaimedFilter(t: number): FilterSpecification {
  return [
    'all',
    ['<=', ['get', 'from'], t],
    ['>', ['get', 'to'], t],
    ['==', ['get', 'kind'], 'unclaimed'],
  ] as FilterSpecification;
}

/**
 * Fill opacity chosen by status, with the default for anything unrecognised.
 * A `match` expression is a tuple to the style spec's types, and building one
 * from a spread loses that shape, so the cast is the price of generating this
 * from POLITY_STATUS instead of hand-listing every status twice.
 */
const fillOpacityByStatus = [
  'match',
  ['get', 'status'],
  ...Object.entries(POLITY_STATUS).flatMap(([status, style]) => [status, style.fillOpacity]),
  POLITY_STATUS[DEFAULT_STATUS].fillOpacity,
] as unknown as ExpressionSpecification;

/** Physical basemap from Natural Earth, with polity fills on top of the land. */
export function buildStyle(t: number, colorScheme: ColorScheme = 'dark'): StyleSpecification {
  const colors = COLORS[colorScheme];
  return {
    version: 8,
    sky: {
      'sky-color': colors.sky,
      'horizon-color': colors.horizon,
      'fog-color': colors.ocean,
      'horizon-fog-blend': 0.6,
      'sky-horizon-blend': 0.7,
    },
    sources: {
      basemap: {
        type: 'geojson',
        data: '/data/basemap.geojson',
        attribution:
          'Physical data © <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
      },
      polities: {
        type: 'geojson',
        data: '/data/polities.geojson',
      },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': colors.ocean } },
      {
        id: 'land',
        type: 'fill',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: { 'fill-color': colors.land },
      },
      {
        id: 'polity-fill',
        type: 'fill',
        source: 'polities',
        filter: polityFilter(t),
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': fillOpacityByStatus,
        },
      },
      // Stripes go over the fill and under the outlines, so a dashed border
      // still reads cleanly against them.
      ...STATIC_HATCHES.map(
        ({ status, imageId }): LayerSpecification => ({
          id: `polity-hatch-${status}`,
          type: 'fill',
          source: 'polities',
          filter: polityFilter(t, status),
          paint: { 'fill-pattern': imageId },
        }),
      ),
      // One layer still, but the image comes off the feature: every claimant on
      // a contested piece of ground draws here, each with its own colour and
      // lean, so they overlay rather than replace one another.
      ...POLITY_HATCHES.map(
        ({ status }): LayerSpecification => ({
          id: `polity-hatch-${status}`,
          type: 'fill',
          source: 'polities',
          filter: polityFilter(t, status),
          paint: { 'fill-pattern': ['get', 'hatch'] },
        }),
      ),
      ...(Object.entries(POLITY_STATUS) as [PolityStatus, StatusStyle][]).map(
        ([status, style]): LayerSpecification => ({
          id: `polity-line-${status}`,
          type: 'line',
          source: 'polities',
          filter: polityFilter(t, status),
          paint: {
            'line-color': ['get', 'color'],
            'line-opacity': style.lineOpacity,
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              1,
              0.6 * style.lineWidth,
              6,
              1.6 * style.lineWidth,
            ],
            ...(style.lineDash ? { 'line-dasharray': [...style.lineDash] } : {}),
          },
        }),
      ),
      // Neither of these colours by feature: an unclaimed region takes the
      // theme's neutral, because there is no owner whose colour it could wear.
      {
        id: UNCLAIMED_FILL,
        type: 'fill',
        source: 'polities',
        filter: unclaimedFilter(t),
        paint: { 'fill-color': colors.unclaimed, 'fill-opacity': UNCLAIMED.fillOpacity },
      },
      {
        id: UNCLAIMED_LINE,
        type: 'line',
        source: 'polities',
        filter: unclaimedFilter(t),
        paint: {
          'line-color': colors.unclaimed,
          'line-opacity': UNCLAIMED.lineOpacity,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1,
            0.6 * UNCLAIMED.lineWidth,
            6,
            1.6 * UNCLAIMED.lineWidth,
          ],
          'line-dasharray': [...UNCLAIMED.lineDash],
        },
      },
      // Sits above every polity layer so the highlight is never half-hidden
      // by a neighbour drawn later, and below the physical features so it
      // does not paint over a lake or a river.
      {
        id: SELECTED_LAYER,
        type: 'line',
        source: 'polities',
        filter: selectionFilter(t, null),
        paint: {
          'line-color': colors.select,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.6, 6, 3],
          'line-opacity': 0.95,
        },
      },
      {
        id: 'lakes',
        type: 'fill',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'lake'],
        paint: { 'fill-color': colors.water },
      },
      {
        id: 'rivers',
        type: 'line',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'river'],
        minzoom: 2.5,
        paint: {
          'line-color': colors.river,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 9, 1.2],
        },
      },
      {
        id: 'coastline',
        type: 'line',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: {
          'line-color': colors.landStroke,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.3, 6, 1],
        },
      },
    ],
  };
}
