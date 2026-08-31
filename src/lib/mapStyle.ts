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
  /** The blurred echo drawn under coastlines and, in some eras, borders. */
  glow: string;
  unclaimed: string;
};

/** The original palette, retained exactly when historical themes are disabled. */
const DEFAULT_COLORS: Record<ColorScheme, Palette> = {
  dark: {
    ocean: '#0b1a26', land: '#222c38', landStroke: 'rgba(150, 175, 200, 0.22)',
    water: '#0d2231', river: 'rgba(120, 170, 210, 0.35)', sky: '#0a1620', horizon: '#16303f',
    select: '#e0b872',
    glow: '#78aad2',
    unclaimed: '#93a7b4',
  },
  light: {
    ocean: '#dbe8ed', land: '#d5d2c7', landStroke: 'rgba(66, 84, 91, 0.34)',
    water: '#c8dfe8', river: 'rgba(67, 126, 157, 0.52)', sky: '#c8e0ea', horizon: '#e8f0ed',
    select: '#8a6124',
    glow: '#437e9d',
    unclaimed: '#69767d',
  },
};

export type HistoricalTheme =
  | 'stone-age'
  | 'bronze-age'
  | 'iron-age'
  | 'middle-ages'
  | 'age-of-exploration'
  | 'industrial-era'
  | 'world-wars'
  | 'cold-war'
  | 'internet-age';

/**
 * Choose the visual era independently of the historical data on the map.
 *
 * The boundaries are the conventional ones and, like any periodisation, they
 * are a European reading of a world that did not change everywhere at once.
 * They decide how the map is drawn; they are not a claim about when an age
 * began.
 */
export function historicalThemeForYear(t: number): HistoricalTheme {
  if (t >= 1990) return 'internet-age';
  if (t >= 1945) return 'cold-war';
  if (t >= 1910) return 'world-wars';
  if (t >= 1800) return 'industrial-era';
  if (t >= 1490) return 'age-of-exploration';
  if (t >= 500) return 'middle-ages';
  if (t >= -1200) return 'iron-age';
  if (t >= -3000) return 'bronze-age';
  return 'stone-age';
}

/**
 * The era palettes. These deliberately differ in more than hue: the
 * relationship between land and ocean lightness is inverted from era to era,
 * because that relationship — not the tint — is what the eye reads first
 * across a whole screen of map. Exploration is pale land on a deep sea, the
 * industrial era is sooty land on a pale one, the world wars are a flat
 * low-contrast khaki, the cold war is near-white land on near-black water, and
 * the internet age is a dark ground lit only by its lines.
 */
const HISTORICAL_COLORS: Record<HistoricalTheme, Record<ColorScheme, Palette>> = {
  // Rock and ochre. Nothing here is drawn, ruled or written; the ground is a
  // surface rather than a document, so the era is almost all texture.
  'stone-age': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#1c1a18', land: '#4a4038', landStroke: 'rgba(210, 178, 140, 0.28)', water: '#2a2724', river: 'rgba(160, 130, 100, 0.4)', sky: '#1e1b18', horizon: '#4a3f34', select: '#d8a86a', glow: '#8a6a48', unclaimed: '#7a6a5a' },
    light: { ...DEFAULT_COLORS.light, ocean: '#cfc6bb', land: '#ddd0be', landStroke: 'rgba(90, 70, 50, 0.4)', water: '#c3bcb1', river: 'rgba(120, 96, 70, 0.5)', sky: '#ddd4c7', horizon: '#eee4d4', select: '#8a5f24', glow: '#9a7a52', unclaimed: '#a89a88' },
  },
  // Sun-baked clay against verdigris. The rivers are the era: the first states
  // sat on them, so they are drawn early and heavily here and nowhere else.
  'bronze-age': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#14302c', land: '#6b4a34', landStroke: 'rgba(226, 190, 130, 0.35)', water: '#1e4640', river: 'rgba(150, 180, 150, 0.45)', sky: '#173230', horizon: '#3f5a4a', select: '#e8b866', glow: '#b98a4e', unclaimed: '#7a5f48' },
    light: { ...DEFAULT_COLORS.light, ocean: '#b6ccc0', land: '#e0bd94', landStroke: 'rgba(110, 70, 36, 0.5)', water: '#a6c4b8', river: 'rgba(78, 110, 90, 0.55)', sky: '#d5dfcc', horizon: '#efe0c4', select: '#8a5a1c', glow: '#a07444', unclaimed: '#a88a68' },
  },
  // Oxidised iron over a slate sea, and the first era whose borders are hard
  // enough to be worth drawing hard.
  'iron-age': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#1a2328', land: '#4c3a33', landStroke: 'rgba(224, 206, 186, 0.4)', water: '#26363c', river: 'rgba(160, 176, 178, 0.45)', sky: '#1c2529', horizon: '#43514f', select: '#d8a05c', glow: '#9a6f52', unclaimed: '#7b6a60' },
    light: { ...DEFAULT_COLORS.light, ocean: '#c3cbcc', land: '#dcc7b6', landStroke: 'rgba(78, 54, 40, 0.55)', water: '#b7c7c8', river: 'rgba(84, 104, 106, 0.55)', sky: '#d3d9d6', horizon: '#eadfd2', select: '#8a4f1c', glow: '#8a6046', unclaimed: '#9a8878' },
  },
  // An illuminated manuscript: vellum land on a lapis sea, gilded at the edges.
  'middle-ages': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#111f3e', land: '#6e5f42', landStroke: 'rgba(238, 220, 176, 0.4)', water: '#1b2f56', river: 'rgba(150, 170, 210, 0.5)', sky: '#131f3c', horizon: '#3a4570', select: '#e8c86a', glow: '#c8a45c', unclaimed: '#6f6450' },
    light: { ...DEFAULT_COLORS.light, ocean: '#aebbdc', land: '#e8dcba', landStroke: 'rgba(94, 76, 40, 0.52)', water: '#a2b2d6', river: 'rgba(74, 94, 140, 0.55)', sky: '#ccd6ea', horizon: '#f0e6c8', select: '#8a6a1c', glow: '#a0803a', unclaimed: '#a8997a' },
  },
  // Parchment chart: pale ochre land floating on deep verdigris water.
  'age-of-exploration': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#17383a', land: '#8a7550', landStroke: 'rgba(52, 38, 18, 0.55)', water: '#255055', river: 'rgba(58, 74, 72, 0.5)', sky: '#1a3335', horizon: '#3f5b53', select: '#f0d8a0', glow: '#c8ab72', unclaimed: '#6f6247' },
    light: { ...DEFAULT_COLORS.light, ocean: '#bcd4cf', land: '#e6d5a8', landStroke: 'rgba(122, 96, 48, 0.5)', water: '#a8c9c6', river: 'rgba(88, 118, 112, 0.55)', sky: '#d9e3cd', horizon: '#f2e7cb', select: '#8a6124', glow: '#8a6a34', unclaimed: '#a89570' },
  },
  // Inverted: soot-dark land against a cold, comparatively pale sea, with the
  // rivers and canals pushed forward rather than hidden.
  'industrial-era': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#4a5c63', land: '#2b2f2e', landStroke: 'rgba(215, 225, 220, 0.3)', water: '#3e565f', river: 'rgba(180, 200, 205, 0.55)', sky: '#2c3a40', horizon: '#5b6b70', select: '#d8c48a', glow: '#9fb4bb', unclaimed: '#7d8a8c' },
    light: { ...DEFAULT_COLORS.light, ocean: '#dfe7e8', land: '#9aa09c', landStroke: 'rgba(30, 36, 36, 0.5)', water: '#cddadd', river: 'rgba(52, 78, 90, 0.6)', sky: '#e2e9e8', horizon: '#eef0ec', select: '#4a5a5e', glow: '#5a6a70', unclaimed: '#7d8482' },
  },
  // A printed war map: flat khaki, almost no land/sea contrast, and the whole
  // reading carried by heavy near-black borders instead.
  'world-wars': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#3b3a30', land: '#575445', landStroke: 'rgba(24, 21, 15, 0.75)', water: '#46463a', river: 'rgba(120, 116, 96, 0.5)', sky: '#3a3930', horizon: '#66634f', select: '#e8d9a8', glow: '#8a8168', unclaimed: '#8c8672' },
    light: { ...DEFAULT_COLORS.light, ocean: '#cfc9b2', land: '#e6dec6', landStroke: 'rgba(52, 45, 33, 0.72)', water: '#c6c6b2', river: 'rgba(110, 104, 82, 0.5)', sky: '#ded7c2', horizon: '#efe7d0', select: '#5a442f', glow: '#6e6852', unclaimed: '#a29a80' },
  },
  // Two poles: near-black water under desaturated steel land. Fills stay weak
  // so that the borders — the thing the era was actually about — dominate.
  'cold-war': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#101c24', land: '#5d6a6b', landStroke: 'rgba(226, 236, 240, 0.45)', water: '#1b3038', river: 'rgba(150, 178, 186, 0.4)', sky: '#131f27', horizon: '#3b4c52', select: '#e8b45c', glow: '#7fb4c6', unclaimed: '#7f8c8f' },
    light: { ...DEFAULT_COLORS.light, ocean: '#a8bcc6', land: '#eceee9', landStroke: 'rgba(30, 44, 52, 0.55)', water: '#b6cdd6', river: 'rgba(64, 100, 116, 0.5)', sky: '#cbd9df', horizon: '#e6ecef', select: '#96601c', glow: '#4d7f92', unclaimed: '#8fa0a6' },
  },
  // Unlit ground, luminous lines.
  'internet-age': {
    dark: { ...DEFAULT_COLORS.dark, ocean: '#03121f', land: '#0f2730', landStroke: 'rgba(110, 240, 255, 0.6)', water: '#06405e', river: 'rgba(90, 230, 255, 0.7)', sky: '#02101d', horizon: '#0a5f85', select: '#6ff4ff', glow: '#62e5ff', unclaimed: '#3d7f92' },
    light: { ...DEFAULT_COLORS.light, ocean: '#cdeff8', land: '#eafaf7', landStroke: 'rgba(0, 130, 165, 0.6)', water: '#a8e6f5', river: 'rgba(0, 150, 190, 0.7)', sky: '#dbf5fb', horizon: '#f0fdfa', select: '#0090c4', glow: '#00a6d4', unclaimed: '#6fa8b6' },
  },
};

/**
 * Everything the eras differ on that is not a colour. Colour alone cannot
 * carry an era at map scale — a wash at ten per cent reads as the same map
 * slightly tinted — so each era also draws differently: how heavy the coast
 * is, whether it glows, how solid the fills are, how loud the borders are,
 * whether rivers are part of the story at all.
 *
 * Every knob here resolves to a *paint* property, and the layer list is the
 * same in every era. That is deliberate: it is what lets a change of era be
 * applied in place, so MapLibre cross-fades it rather than the style being
 * torn down and rebuilt in the middle of a timeline drag.
 */
type Linework = {
  /** A wide blurred echo under the coastline. `opacity: 0` turns it off. */
  coastGlow: { width: readonly [number, number]; blur: number; opacity: number };
  /** Coastline weight at zoom 1 and at zoom 6. */
  coast: readonly [number, number];
  /** Multiplies every status fill opacity, and the unclaimed fill with them. */
  fill: number;
  /** Multiplies every status outline. */
  line: { width: number; opacity: number };
  /** A blurred echo under the polity borders. `opacity: 0` turns it off. */
  borderGlow: { width: number; blur: number; opacity: number };
  /** Rivers ramp in over the zoom above `fadeAt`; `opacity: 0` hides them. */
  rivers: { fadeAt: number; width: readonly [number, number]; opacity: number };
};

const NO_GLOW = { width: 0, blur: 0, opacity: 0 } as const;

/** The original linework, kept for when historical themes are switched off. */
const DEFAULT_LINEWORK: Linework = {
  coastGlow: { width: [0, 0], blur: 0, opacity: 0 },
  coast: [0.3, 1],
  fill: 1,
  line: { width: 1, opacity: 1 },
  borderGlow: NO_GLOW,
  rivers: { fadeAt: 2.5, width: [0.3, 1.2], opacity: 1 },
};

const HISTORICAL_LINEWORK: Record<HistoricalTheme, Linework> = {
  // Almost no linework at all: a wide soft coast that never resolves into an
  // edge, weak fills, and borders as faint as the vocabulary allows. Whatever
  // the data says, this era should not look surveyed.
  'stone-age': {
    coastGlow: { width: [4, 9], blur: 5, opacity: 0.28 },
    coast: [0.25, 0.8],
    fill: 0.7,
    line: { width: 0.7, opacity: 0.6 },
    borderGlow: NO_GLOW,
    rivers: { fadeAt: 4.5, width: [0.3, 1], opacity: 0.6 },
  },
  // Soft like the stone age, except for the water: river valleys come in early
  // and wide, because they are what there was to hold.
  'bronze-age': {
    coastGlow: { width: [3, 8], blur: 4, opacity: 0.3 },
    coast: [0.3, 0.95],
    fill: 0.8,
    line: { width: 0.85, opacity: 0.75 },
    borderGlow: NO_GLOW,
    rivers: { fadeAt: 2, width: [0.5, 1.9], opacity: 1 },
  },
  // The first hard edges: heavier coast, firmer fills, borders that mean it.
  'iron-age': {
    coastGlow: { width: [2, 5], blur: 3, opacity: 0.2 },
    coast: [0.5, 1.5],
    fill: 1.1,
    line: { width: 1.25, opacity: 0.95 },
    borderGlow: NO_GLOW,
    rivers: { fadeAt: 2.5, width: [0.4, 1.5], opacity: 0.9 },
  },
  // Ruled and gilded rather than surveyed: a fine coast inside a warm halo,
  // the way a manuscript outlines a shore nobody had measured.
  'middle-ages': {
    coastGlow: { width: [3, 7], blur: 3, opacity: 0.35 },
    coast: [0.4, 1.25],
    fill: 0.95,
    line: { width: 1, opacity: 0.85 },
    borderGlow: NO_GLOW,
    rivers: { fadeAt: 3, width: [0.35, 1.2], opacity: 0.8 },
  },
  // An engraved shoreline: a wide soft halo under a fine sharp coast, the way
  // a copperplate chart shades the water away from the land. Rivers were not
  // yet surveyed inland, so they stay out of the picture until close in.
  'age-of-exploration': {
    coastGlow: { width: [3, 7], blur: 3, opacity: 0.32 },
    coast: [0.35, 1.1],
    fill: 0.85,
    line: { width: 0.85, opacity: 0.8 },
    borderGlow: NO_GLOW,
    rivers: { fadeAt: 4, width: [0.3, 1.1], opacity: 0.75 },
  },
  // Nothing soft: a hard printed coast, no halo, and waterways given real
  // weight because they are what the era moved on.
  'industrial-era': {
    coastGlow: { width: [0, 0], blur: 0, opacity: 0 },
    coast: [0.5, 1.4],
    fill: 1,
    line: { width: 1.05, opacity: 0.95 },
    borderGlow: NO_GLOW,
    rivers: { fadeAt: 2, width: [0.45, 1.8], opacity: 1 },
  },
  // A newspaper war map: flat near-opaque blocks inside heavy borders, no
  // glow, no rivers — only who holds what.
  'world-wars': {
    coastGlow: { width: [0, 0], blur: 0, opacity: 0 },
    coast: [0.7, 2],
    fill: 1.6,
    line: { width: 1.5, opacity: 1 },
    borderGlow: NO_GLOW,
    rivers: { fadeAt: 2, width: [0.3, 1], opacity: 0 },
  },
  // Weak fills under very heavy borders: the line, not the territory, is the
  // subject of the era.
  'cold-war': {
    coastGlow: { width: [2, 5], blur: 4, opacity: 0.18 },
    coast: [0.4, 1.2],
    fill: 0.55,
    line: { width: 1.6, opacity: 1 },
    borderGlow: NO_GLOW,
    rivers: { fadeAt: 3, width: [0.3, 1.1], opacity: 0.55 },
  },
  // Barely-there ground with everything else emitting light.
  'internet-age': {
    coastGlow: { width: [2, 6], blur: 4, opacity: 0.5 },
    coast: [0.4, 1.2],
    fill: 0.35,
    line: { width: 0.9, opacity: 1 },
    borderGlow: { width: 5, blur: 4, opacity: 0.45 },
    rivers: { fadeAt: 2.5, width: [0.35, 1.3], opacity: 1 },
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

/** The blurred echo under the coastline, and the one under polity borders. */
export const COAST_GLOW = 'theme-coastline-glow';
export const POLITY_GLOW = 'polity-glow';

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
  { id: POLITY_GLOW, filter: (t) => polityFilter(t) },
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
 * Fill opacity chosen by status, scaled by the era's `fill` multiplier, with
 * the default for anything unrecognised. A `match` expression is a tuple to
 * the style spec's types, and building one from a spread loses that shape, so
 * the cast is the price of generating this from POLITY_STATUS instead of
 * hand-listing every status twice.
 */
function fillOpacityByStatus(scale: number): ExpressionSpecification {
  return [
    'match',
    ['get', 'status'],
    ...Object.entries(POLITY_STATUS).flatMap(([status, style]) => [
      status,
      style.fillOpacity * scale,
    ]),
    POLITY_STATUS[DEFAULT_STATUS].fillOpacity * scale,
  ] as unknown as ExpressionSpecification;
}

/** The source every polity layer draws from. */
export const POLITY_SOURCE = 'polities';

/**
 * One layer's paint properties. Untyped per property because a single record
 * carries paint for background, fill and line layers alike; every value in it
 * is checked by MapLibre when the style is validated, and by `astro check`
 * where buildStyle hands it to a typed layer.
 */
type LayerPaint = Record<string, any>;

export type ThemePaint = {
  sky: StyleSpecification['sky'];
  /** Paint properties by layer id. Exactly the values that vary by era. */
  layers: Record<string, LayerPaint>;
};

/** A zoom ramp between `near` (zoom 1) and `far` (zoom 6). */
function byZoom([near, far]: readonly [number, number], scale = 1): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 1, near * scale, 6, far * scale];
}

/** Invisible below `fadeAt`, at full `opacity` a little above it. */
function fadeIn(fadeAt: number, opacity: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], fadeAt, 0, fadeAt + 0.8, opacity];
}

/**
 * Everything about the map that depends on the era, and nothing that does not.
 * Because this is paint only, changing era is a matter of setting these
 * properties on the running style — see applyTheme in components/map — rather
 * than building a new one.
 */
export function themePaint(
  t: number,
  colorScheme: ColorScheme = 'dark',
  historicalThemes = true,
): ThemePaint {
  const theme = historicalThemes ? historicalThemeForYear(t) : null;
  const colors = theme ? HISTORICAL_COLORS[theme][colorScheme] : DEFAULT_COLORS[colorScheme];
  const work = theme ? HISTORICAL_LINEWORK[theme] : DEFAULT_LINEWORK;

  const layers: Record<string, LayerPaint> = {
    ocean: { 'background-color': colors.ocean },
    land: { 'fill-color': colors.land },
    [COAST_GLOW]: {
      'line-color': colors.glow,
      'line-opacity': work.coastGlow.opacity,
      'line-width': byZoom(work.coastGlow.width),
      'line-blur': work.coastGlow.blur,
    },
    'polity-fill': { 'fill-opacity': fillOpacityByStatus(work.fill) },
    [POLITY_GLOW]: {
      'line-opacity': work.borderGlow.opacity,
      'line-width': work.borderGlow.width,
      'line-blur': work.borderGlow.blur,
    },
    [UNCLAIMED_FILL]: {
      'fill-color': colors.unclaimed,
      'fill-opacity': UNCLAIMED.fillOpacity * work.fill,
    },
    [UNCLAIMED_LINE]: {
      'line-color': colors.unclaimed,
      'line-opacity': UNCLAIMED.lineOpacity * work.line.opacity,
      'line-width': byZoom(
        [0.6 * UNCLAIMED.lineWidth, 1.6 * UNCLAIMED.lineWidth],
        work.line.width,
      ),
    },
    [SELECTED_LAYER]: { 'line-color': colors.select },
    lakes: { 'fill-color': colors.water },
    rivers: {
      'line-color': colors.river,
      'line-width': byZoom(work.rivers.width),
      'line-opacity': fadeIn(work.rivers.fadeAt, work.rivers.opacity),
    },
    coastline: { 'line-color': colors.landStroke, 'line-width': byZoom(work.coast) },
  };

  for (const [status, style] of Object.entries(POLITY_STATUS) as [PolityStatus, StatusStyle][]) {
    layers[`polity-line-${status}`] = {
      'line-opacity': style.lineOpacity * work.line.opacity,
      'line-width': byZoom([0.6 * style.lineWidth, 1.6 * style.lineWidth], work.line.width),
    };
  }

  return {
    sky: {
      'sky-color': colors.sky,
      'horizon-color': colors.horizon,
      'fog-color': colors.ocean,
      'horizon-fog-blend': 0.6,
      'sky-horizon-blend': 0.7,
    },
    layers,
  };
}

/**
 * Physical basemap from Natural Earth, with polity fills on top of the land.
 *
 * The layer list here is fixed: an era never adds or removes a layer, it only
 * changes what themePaint says about the ones that are always present. A layer
 * an era does not want is painted at zero opacity instead of being left out,
 * which costs nothing to draw and keeps eras interchangeable at runtime.
 */
export function buildStyle(
  t: number,
  colorScheme: ColorScheme = 'dark',
  historicalThemes = true,
): StyleSpecification {
  const paint = themePaint(t, colorScheme, historicalThemes);
  return {
    version: 8,
    // Crossing an era boundary is a paint change, so MapLibre fades it. Long
    // enough to read as a change of light, short enough not to lag a scrub.
    transition: { duration: 600, delay: 0 },
    sky: paint.sky,
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
      { id: 'ocean', type: 'background', paint: paint.layers.ocean },
      {
        id: 'land',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'basemap',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: paint.layers.land,
      },
      // A low, blurred coastline echo, using only the physical land already in
      // the basemap. Eras that want a hard printed coast paint it away.
      {
        id: COAST_GLOW,
        type: 'line',
        source: 'basemap',
        'source-layer': 'basemap',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: paint.layers[COAST_GLOW],
      },
      {
        id: 'polity-fill',
        type: 'fill',
        source: POLITY_SOURCE,
        'source-layer': 'polities',
        filter: polityFilter(t),
        paint: {
          'fill-color': ['get', 'color'],
          ...paint.layers['polity-fill'],
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
      // A border in the polity's own colour, bled outwards under the real
      // outline. Only the eras that want lit borders paint it at all.
      {
        id: POLITY_GLOW,
        type: 'line',
        source: POLITY_SOURCE,
        'source-layer': 'polities',
        filter: polityFilter(t),
        paint: {
          'line-color': ['get', 'color'],
          ...paint.layers[POLITY_GLOW],
        },
      },
      ...(Object.entries(POLITY_STATUS) as [PolityStatus, StatusStyle][]).map(
        ([status, style]): LayerSpecification => ({
          id: `polity-line-${status}`,
          type: 'line',
          source: POLITY_SOURCE,
          'source-layer': 'polities',
          filter: polityFilter(t, status),
          paint: {
            'line-color': ['get', 'color'],
            ...(style.lineDash ? { 'line-dasharray': [...style.lineDash] } : {}),
            ...paint.layers[`polity-line-${status}`],
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
        paint: paint.layers[UNCLAIMED_FILL],
      },
      {
        id: UNCLAIMED_LINE,
        type: 'line',
        source: POLITY_SOURCE,
        'source-layer': 'polities',
        filter: unclaimedFilter(t),
        paint: {
          'line-dasharray': [...UNCLAIMED.lineDash],
          ...paint.layers[UNCLAIMED_LINE],
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.6, 6, 3],
          'line-opacity': 0.95,
          ...paint.layers[SELECTED_LAYER],
        },
      },
      {
        id: 'lakes',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'basemap',
        filter: ['==', ['get', 'kind'], 'lake'],
        paint: paint.layers.lakes,
      },
      // The zoom at which rivers appear is an era's choice, so it lives in the
      // paint ramp rather than in minzoom, which no era could then change.
      {
        id: 'rivers',
        type: 'line',
        source: 'basemap',
        'source-layer': 'basemap',
        filter: ['==', ['get', 'kind'], 'river'],
        minzoom: 2,
        paint: paint.layers.rivers,
      },
      {
        id: 'coastline',
        type: 'line',
        source: 'basemap',
        'source-layer': 'basemap',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: paint.layers.coastline,
      },
    ],
  };
}
