// Downloads the raw physical basemap into data/sources/. Cached on disk;
// pass --force to redownload.
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SOURCES_DIR, NATURAL_EARTH_LAYERS, NATURAL_EARTH_PARTS } from './lib/config.mjs';

const FORCE = process.argv.includes('--force');
const NE_RAW = (layer) =>
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${layer}.geojson`;

async function exists(path) {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function download(url, destination, label) {
  if (!FORCE && (await exists(destination))) {
    process.stdout.write(`  · ${label} (cached)\n`);
    return;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, body);
  process.stdout.write(`  ↓ ${label} (${(body.length / 1024).toFixed(0)} KB)\n`);
}

const naturalEarthDir = join(SOURCES_DIR, 'naturalearth');
await mkdir(naturalEarthDir, { recursive: true });

console.log('Natural Earth (public domain)');
await Promise.all([
  ...NATURAL_EARTH_LAYERS.map((layer) =>
    download(NE_RAW(layer.file), join(naturalEarthDir, `${layer.file}.geojson`), layer.file),
  ),
  download(
    NE_RAW(NATURAL_EARTH_PARTS),
    join(naturalEarthDir, `${NATURAL_EARTH_PARTS}.geojson`),
    NATURAL_EARTH_PARTS,
  ),
]);

console.log('\nNext: npm run data:build');
