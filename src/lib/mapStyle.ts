import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type { HatchSpec } from './hatch';

type ColorScheme = 'light' | 'dark';

const COLORS: Record<ColorScheme, {
  ocean: string;
  land: string;
  landStroke: string;
  water: string;
  river: string;
  sky: string;
  horizon: string;
}> = {
  dark: {
    ocean: '#0b1a26', land: '#222c38', landStroke: 'rgba(150, 175, 200, 0.22)',
    water: '#0d2231', river: 'rgba(120, 170, 210, 0.35)', sky: '#0a1620', horizon: '#16303f',
  },
  light: {
    ocean: '#dbe8ed', land: '#d5d2c7', landStroke: 'rgba(66, 84, 91, 0.34)',
    water: '#c8dfe8', river: 'rgba(67, 126, 157, 0.52)', sky: '#c8e0ea', horizon: '#e8f0ed',
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
    fillOpacity: 0.45,
    hatch: null,
    lineOpacity: 0.9,
    lineWidth: 1,
    lineDash: null,
  },
  /** Held in fact, but the claim is rejected — occupation, annexation, secession. */
  disputed: {
    fillOpacity: 0.3,
    // Neutral stripes over the polity's own colour, so the treatment reads the
    // same whoever holds the ground. A coloured hatch would need one pattern
    // image per polity, since fill-pattern cannot be tinted per feature.
    hatch: { size: 8, period: 4, thickness: 1.4, color: [255, 255, 255], opacity: 0.5 },
    lineOpacity: 1,
    lineWidth: 1.3,
    lineDash: [2, 1.6],
  },
} as const satisfies Record<string, StatusStyle>;

type StatusStyle = {
  fillOpacity: number;
  /** Diagonal stripes drawn over the fill, or null for a plain fill. */
  hatch: HatchSpec | null;
  lineOpacity: number;
  lineWidth: number;
  lineDash: readonly number[] | null;
};

export type PolityStatus = keyof typeof POLITY_STATUS;

/** What a span without an explicit status means. */
export const DEFAULT_STATUS: PolityStatus = 'controlled';

/**
 * The layers whose visible features depend on the current instant. Outlines are
 * one layer per status because line-dasharray cannot be driven by a feature
 * property; the fill can, so it stays a single layer.
 */
/** The statuses that draw stripes, and the pattern image each one registers. */
export const HATCHED_STATUSES = (Object.entries(POLITY_STATUS) as [PolityStatus, StatusStyle][])
  .filter(([, style]) => style.hatch)
  .map(([status, style]) => ({ status, imageId: `hatch-${status}`, hatch: style.hatch! }));

export const POLITY_LAYERS: { id: string; status?: PolityStatus }[] = [
  { id: 'polity-fill' },
  ...HATCHED_STATUSES.map(({ status }) => ({ id: `polity-hatch-${status}`, status })),
  ...(Object.keys(POLITY_STATUS) as PolityStatus[]).map((status) => ({
    id: `polity-line-${status}`,
    status,
  })),
];

/**
 * A polity feature is on screen for exactly the span it existed. This one
 * expression is the whole time model at runtime — there is nothing to join.
 */
export function polityFilter(t: number, status?: PolityStatus): FilterSpecification {
  const clauses: ExpressionSpecification[] = [
    ['<=', ['get', 'from'], t],
    ['>', ['get', 'to'], t],
  ];
  if (status) clauses.push(['==', ['get', 'status'], status]);
  // Spreading defeats the tuple inference the style spec's filter type wants.
  return ['all', ...clauses] as FilterSpecification;
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
      ...HATCHED_STATUSES.map(
        ({ status, imageId }): LayerSpecification => ({
          id: `polity-hatch-${status}`,
          type: 'fill',
          source: 'polities',
          filter: polityFilter(t, status),
          paint: { 'fill-pattern': imageId },
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
