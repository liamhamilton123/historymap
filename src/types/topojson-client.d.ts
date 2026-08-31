/**
 * topojson-client ships no types. Only `feature` is used, and only ever on the
 * one object the data build writes — a GeometryCollection — for which it
 * returns a FeatureCollection rather than a bare Feature.
 */
declare module 'topojson-client' {
  import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

  export function feature(
    topology: unknown,
    object: unknown,
  ): FeatureCollection<Geometry, GeoJsonProperties>;
}
