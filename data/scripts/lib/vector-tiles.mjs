import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

/**
 * The input geometry is already simplified for close views. Six levels give a
 * useful geographic split without emitting an impractical number of files;
 * MapLibre overscales the final level.
 */
export const TILE_MAX_ZOOM = 6;

/**
 * How much of the pyramid geojson-vt builds up front.
 *
 * Indexing to the full depth pre-splits every tile at every zoom and holds the
 * lot: at the scale of the whole Cliopatria import — 12,170 features, 5.9M
 * vertices — that alone is several gigabytes, and the build died there rather
 * than on anything it was computing. Indexing the top of the pyramid and
 * letting `getTile` split the rest on demand costs a little more time per tile
 * and bounds the memory, which is the trade worth making: the tiles come out
 * identical either way.
 */
const INDEX_MAX_ZOOM = 2;

/** geojson-vt's own tile key, so a written tile can be dropped from its cache. */
const tileId = (z, x, y) => (((1 << z) * y + x) * 32) + z;

/** Write a GeoJSON collection as standard, static Mapbox vector tiles. */
export async function writeVectorTiles(collection, directory, layer) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  const index = geojsonvt(collection, {
    maxZoom: TILE_MAX_ZOOM,
    indexMaxZoom: INDEX_MAX_ZOOM,
    indexMaxPoints: 0,
    tolerance: 1,
  });

  let bytes = 0;
  let tiles = 0;

  // Walked from the top rather than read off `index.tileCoords`, which only
  // lists what was indexed up front and so no longer reaches the deep zooms.
  // A tile holds a subset of its parent's features, so a parent with none has
  // no descendants worth visiting and the whole branch is skipped.
  const emit = async (z, x, y) => {
    const tile = index.getTile(z, x, y);
    if (!tile?.features.length) return;

    const encoded = vtpbf.fromGeojsonVt({ [layer]: tile });
    await mkdir(join(directory, String(z), String(x)), { recursive: true });
    await writeFile(join(directory, String(z), String(x), `${y}.pbf`), encoded);
    bytes += encoded.length;
    tiles++;

    if (z < TILE_MAX_ZOOM) {
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) await emit(z + 1, x * 2 + dx, y * 2 + dy);
      }
    }
    // Written and descended into, so nothing needs it again. The indexed tiles
    // at the top of the pyramid stay: `getTile` splits down from the nearest
    // one it still has, and dropping those would make it re-split from the
    // root every time.
    if (z > INDEX_MAX_ZOOM) delete index.tiles[tileId(z, x, y)];
  };
  await emit(0, 0, 0);

  return { tiles, bytes };
}
