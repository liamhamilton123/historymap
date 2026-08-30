import type { StyleSpecification } from 'maplibre-gl';

const COLORS = {
  ocean: '#0b1a26',
  land: '#222c38',
  landStroke: 'rgba(150, 175, 200, 0.22)',
  water: '#0d2231',
  river: 'rgba(120, 170, 210, 0.35)',
};

/** Physical basemap only — land, lakes and rivers from Natural Earth. */
export function buildStyle(): StyleSpecification {
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
