import { feature } from 'topojson-client';
import type { FeatureCollection } from 'geojson';

/**
 * The polity spans, as TopoJSON. Every span is dissolved out of a shared parts
 * bin, so spans repeat each other's outlines — Canada's Pacific coast is
 * identical across all six of its spans. TopoJSON stores each shared outline
 * once and has every span reference it, which is why this file barely grows as
 * history is added, where the equivalent GeoJSON grows with every span.
 *
 * MapLibre cannot read TopoJSON, so it is converted here and handed to the
 * source with setData. The conversion is a few milliseconds on this data.
 */
const POLITIES_URL = '/data/polities.topojson';

/**
 * Fetched and converted once, then reused. A light/dark switch rebuilds the
 * whole style, which drops the source and its data with it — without the cache
 * every theme toggle would refetch and reconvert the entire map.
 */
let polities: Promise<FeatureCollection> | null = null;

export function loadPolities(): Promise<FeatureCollection> {
  polities ??= fetch(POLITIES_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status} fetching ${POLITIES_URL}`);
      return response.json();
    })
    .then((topology) => feature(topology, topology.objects.polities))
    .catch((error) => {
      // A failed load must not be cached, or the retry a style reload would
      // otherwise get is spent re-throwing the first failure forever.
      polities = null;
      throw error;
    });
  return polities;
}
