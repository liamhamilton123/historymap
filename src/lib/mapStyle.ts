import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';

const COLORS = {
  ocean: '#0b1a26',
  land: '#222c38',
  landStroke: 'rgba(150, 175, 200, 0.22)',
  water: '#0d2231',
  river: 'rgba(120, 170, 210, 0.35)',
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
  controlled: { fillOpacity: 0.45, lineOpacity: 0.9, lineWidth: 1, lineDash: null },
  /** Held in fact, but the claim is rejected — occupation, annexation, secession. */
  disputed: { fillOpacity: 0.18, lineOpacity: 1, lineWidth: 1.3, lineDash: [2, 1.6] },
} as const satisfies Record<string, StatusStyle>;

type StatusStyle = {
  fillOpacity: number;
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
export const POLITY_LAYERS: { id: string; status?: PolityStatus }[] = [
  { id: 'polity-fill' },
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
export function buildStyle(t: number): StyleSpecification {
  return {
    version: 8,
    sky: {
      'sky-color': '#0a1620',
      'horizon-color': '#16303f',
      'fog-color': '#0b1a26',
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
      { id: 'ocean', type: 'background', paint: { 'background-color': COLORS.ocean } },
      {
        id: 'land',
        type: 'fill',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: { 'fill-color': COLORS.land },
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
        paint: { 'fill-color': COLORS.water },
      },
      {
        id: 'rivers',
        type: 'line',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'river'],
        minzoom: 2.5,
        paint: {
          'line-color': COLORS.river,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 9, 1.2],
        },
      },
      {
        id: 'coastline',
        type: 'line',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: {
          'line-color': COLORS.landStroke,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.3, 6, 1],
        },
      },
    ],
  };
}
