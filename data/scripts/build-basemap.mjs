// Natural Earth physical layers -> one simplified FeatureCollection tagged by
// `kind`, so the map can drive land / lake / river styling from a single source.
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { SOURCES_DIR, OUT_DIR, NATURAL_EARTH_LAYERS } from './lib/config.mjs';
import { simplifyGeometry } from './lib/geo.mjs';
import { writeVectorTiles } from './lib/vector-tiles.mjs';

// Preserve enough of the 1:50m source geometry to hold up at the map's
// maximum zoom without making the single GeoJSON source needlessly large.
const TOLERANCE = 0.001;
const MIN_AREA = 0.01;

const features = [];

for (const layer of NATURAL_EARTH_LAYERS) {
  const path = join(SOURCES_DIR, 'naturalearth', `${layer.file}.geojson`);
  const collection = JSON.parse(await readFile(path, 'utf8'));
  let kept = 0;
  for (const feature of collection.features) {
    const geometry = simplifyGeometry(feature.geometry, {
      tolerance: TOLERANCE,
      minArea: layer.kind === 'river' ? 0 : MIN_AREA,
    });
    if (!geometry) continue;
    features.push({
      type: 'Feature',
      properties: { kind: layer.kind, name: feature.properties?.name ?? null },
      geometry,
    });
    kept++;
  }
  console.log(`  ${layer.file}: ${kept}/${collection.features.length} features`);
}

const result = await writeVectorTiles(
  { type: 'FeatureCollection', features },
  join(OUT_DIR, 'basemap'),
  'basemap',
);
// A previous build format emitted this full-world source. Do not leave it in
// the static output once the tile pyramid has replaced it.
await rm(join(OUT_DIR, 'basemap.geojson'), { force: true });
console.log(
  `\nbasemap tiles · ${features.length} features · ${result.tiles} tiles · ${(result.bytes / 1024).toFixed(0)} KB`,
);
