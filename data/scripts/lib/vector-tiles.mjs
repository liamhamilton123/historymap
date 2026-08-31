import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

/**
 * The input geometry is already simplified for close views. Six levels give a
 * useful geographic split without emitting an impractical number of files;
 * MapLibre overscales the final level.
 */
export const TILE_MAX_ZOOM = 6;

/** Write a GeoJSON collection as standard, static Mapbox vector tiles. */
export async function writeVectorTiles(collection, directory, layer) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  const index = geojsonvt(collection, {
    maxZoom: TILE_MAX_ZOOM,
    indexMaxZoom: TILE_MAX_ZOOM,
    indexMaxPoints: 0,
    tolerance: 1,
  });

  let bytes = 0;
  let tiles = 0;
  for (const { z, x, y } of index.tileCoords) {
    const tile = index.getTile(z, x, y);
    if (!tile?.features.length) continue;
    const path = join(directory, String(z), String(x), `${y}.pbf`);
    await mkdir(join(directory, String(z), String(x)), { recursive: true });
    const encoded = vtpbf.fromGeojsonVt({ [layer]: tile });
    await writeFile(path, encoded);
    bytes += (await stat(path)).size;
    tiles++;
  }

  return { tiles, bytes };
}
