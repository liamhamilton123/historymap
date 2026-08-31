import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { POLITY_COLOR, type HatchSpec } from './hatch';

type ColorScheme = 'light' | 'dark';

type Palette = {
  ocean: string;
  land: string;
  landStroke: string;
  water: string;
  river: string;
  sky: string;
  horizon: string;
  select: string;
  unclaimed: string;
};

/** The original palette, retained exactly when historical themes are disabled. */
const DEFAULT_COLORS: Record<ColorScheme, Palette> = {
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

export type HistoricalTheme =
  | 'age-of-exploration'
  | 'industrial-era'
  | 'world-wars'
  | 'cold-war'
  | 'internet-age';

/** Choose the visual era independently of the historical data on the map. */
export function historicalThemeForYear(t: number): HistoricalTheme {
  if (t >= 1990) return 'internet-age';
  if (t >= 1945) return 'cold-war';
  if (t >= 1910) return 'world-wars';
  if (t >= 1800) return 'industrial-era';
  return 'age-of-exploration';
}

/**
 * A first-pass set of era palettes. Keeping these as plain MapLibre colours
 * makes later additions such as paper textures or animated water independent
 * of the timeline and easy to add per era.
 */
const HISTORICAL_COLORS: Record<HistoricalTheme, Record<ColorScheme, Palette>> = {
  'age-of-exploration': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#132b35', land: '#40392c', water: '#1b3b45', river: 'rgba(161, 189, 173, 0.38)', sky: '#172a2d', horizon: '#405149' },
    light: { ...DEFAULT_COLORS.light, ocean: '#b9d3d2', land: '#ded1ab', water: '#a9ced0', river: 'rgba(73, 130, 132, 0.54)', sky: '#d8e2cf', horizon: '#f0e5c9' },
  },
  'industrial-era': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#182a36', land: '#343735', water: '#203b48', river: 'rgba(142, 174, 190, 0.38)', sky: '#202d35', horizon: '#46525a' },
    light: { ...DEFAULT_COLORS.light, ocean: '#c4d5d8', land: '#cec9b9', water: '#b6d2d8', river: 'rgba(77, 125, 145, 0.5)', sky: '#d7e0dc', horizon: '#e3e0d3' },
  },
  'world-wars': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#252522', land: '#4a473e', landStroke: 'rgba(220, 209, 176, 0.3)', water: '#373a36', river: 'rgba(190, 189, 166, 0.38)', sky: '#292825', horizon: '#58564c', select: '#e0d0a4' },
    light: { ...DEFAULT_COLORS.light, ocean: '#d4d0c1', land: '#e4dcc8', landStroke: 'rgba(66, 60, 48, 0.52)', water: '#c8cfbf', river: 'rgba(73, 86, 78, 0.52)', sky: '#ded9ca', horizon: '#eee6d2', select: '#564131' },
  },
  'cold-war': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#1a272d', land: '#3d433b', landStroke: 'rgba(190, 177, 139, 0.3)', water: '#293c42', river: 'rgba(153, 181, 180, 0.42)', sky: '#20292d', horizon: '#4a5553', select: '#e0b56c' },
    light: { ...DEFAULT_COLORS.light, ocean: '#d0dad4', land: '#d6cfbd', landStroke: 'rgba(102, 105, 87, 0.4)', water: '#c2d7d7', river: 'rgba(82, 124, 125, 0.52)', sky: '#d9ddd5', horizon: '#e7dfcc', select: '#986e2b' },
  },
  'internet-age': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#062b4a', land: '#21434d', landStroke: 'rgba(106, 230, 247, 0.48)', water: '#075276', river: 'rgba(83, 222, 245, 0.66)', sky: '#061d36', horizon: '#0b6b93', select: '#67edff' },
    light: { ...DEFAULT_COLORS.light, ocean: '#b7eaf5', land: '#d0e4da', landStroke: 'rgba(12, 135, 167, 0.5)', water: '#91e0f1', river: 'rgba(0, 156, 197, 0.66)', sky: '#c2eff7', horizon: '#e3fbf2', select: '#007ba9' },
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

/** The source every polity layer draws from. */
export const POLITY_SOURCE = 'polities';

/** Physical basemap from Natural Earth, with polity fills on top of the land. */
export function buildStyle(
  t: number,
  colorScheme: ColorScheme = 'dark',
  historicalThemes = true,
): StyleSpecification {
  const historicalTheme = historicalThemes ? historicalThemeForYear(t) : null;
  const colors = historicalTheme
    ? HISTORICAL_COLORS[historicalTheme][colorScheme]
    : DEFAULT_COLORS[colorScheme];
  const coastGlowLayer: LayerSpecification | null = historicalTheme
    ? {
        id: 'theme-coastline-glow',
        type: 'line',
        source: 'basemap',
        'source-layer': 'basemap',
        filter: ['==', ['get', 'kind'], 'land'] as FilterSpecification,
        paint: {
          'line-color': colors.river,
          'line-opacity': 0.22,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.5, 6, 3],
          'line-blur': 2,
        },
      }
    : null;
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
        type: 'vector',
        tiles: ['/data/basemap/{z}/{x}/{y}.pbf'],
        maxzoom: 6,
        attribution:
          'Physical data © <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
      },
      [POLITY_SOURCE]: {
        type: 'vector',
        tiles: ['/data/polities/{z}/{x}/{y}.pbf'],
        maxzoom: 6,
      },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': colors.ocean } },
      {
        id: 'land',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'basemap',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: { 'fill-color': colors.land },
      },
      // A low, blurred coastline echo gives every historical theme a little
      // depth using only the physical land already in the basemap. It is left
      // out entirely when themes are disabled, preserving the original style.
      ...(coastGlowLayer ? [coastGlowLayer] : []),
      {
        id: 'polity-fill',
        type: 'fill',
        source: POLITY_SOURCE,
        'source-layer': 'polities',
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
          source: POLITY_SOURCE,
          'source-layer': 'polities',
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
          source: POLITY_SOURCE,
          'source-layer': 'polities',
          filter: polityFilter(t, status),
          paint: { 'fill-pattern': ['get', 'hatch'] },
        }),
      ),
      ...(Object.entries(POLITY_STATUS) as [PolityStatus, StatusStyle][]).map(
        ([status, style]): LayerSpecification => ({
          id: `polity-line-${status}`,
          type: 'line',
          source: POLITY_SOURCE,
          'source-layer': 'polities',
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
        source: POLITY_SOURCE,
        'source-layer': 'polities',
        filter: unclaimedFilter(t),
        paint: { 'fill-color': colors.unclaimed, 'fill-opacity': UNCLAIMED.fillOpacity },
      },
      {
        id: UNCLAIMED_LINE,
        type: 'line',
        source: POLITY_SOURCE,
        'source-layer': 'polities',
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
        source: POLITY_SOURCE,
        'source-layer': 'polities',
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
        'source-layer': 'basemap',
        filter: ['==', ['get', 'kind'], 'lake'],
        paint: { 'fill-color': colors.water },
      },
      {
        id: 'rivers',
        type: 'line',
        source: 'basemap',
        'source-layer': 'basemap',
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
        'source-layer': 'basemap',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: {
          'line-color': colors.landStroke,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.3, 6, 1],
        },
      },
    ],
  };
}
