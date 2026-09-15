// Downloads the raw physical basemap into data/sources/. Cached on disk;
// pass --force to redownload.
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import {
  SOURCES_DIR,
  NATURAL_EARTH_LAYERS,
  CLIOPATRIA_URL,
  CLIOPATRIA_FILE,
} from './lib/config.mjs';

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
await Promise.all(
  NATURAL_EARTH_LAYERS.map((layer) =>
    download(NE_RAW(layer.file), join(naturalEarthDir, `${layer.file}.geojson`), layer.file),
  ),
);

/**
 * The Cliopatria release is a zip holding one entry. Rather than depend on an
 * `unzip` binary or a package, the single local file header is read directly:
 * a zip entry is a 30-byte header, two variable-length fields, and a raw
 * deflate stream, which node's zlib inflates on its own.
 */
function firstZipEntry(zip) {
  if (zip.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip archive');
  const method = zip.readUInt16LE(8);
  const nameLength = zip.readUInt16LE(26);
  const extraLength = zip.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;
  const name = zip.subarray(30, 30 + nameLength).toString();
  // Sizes in the local header are zero when the entry was written as a stream,
  // so the compressed run is taken as everything up to the next signature.
  let end = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), start);
  if (end < 0) end = zip.length;
  const body = zip.subarray(start, end);
  return { name, data: method === 0 ? body : inflateRawSync(body) };
}

// Kept out of the Promise.all above: it is 44 MB, and it is only needed by the
// importer, never by a build.
console.log('\nCliopatria / Seshat Global History Databank (CC BY 4.0)');
if (!FORCE && (await exists(CLIOPATRIA_FILE))) {
  process.stdout.write('  · cliopatria (cached)\n');
} else {
  const response = await fetch(CLIOPATRIA_URL);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${CLIOPATRIA_URL}`);
  const zip = Buffer.from(await response.arrayBuffer());
  const entry = firstZipEntry(zip);
  await mkdir(dirname(CLIOPATRIA_FILE), { recursive: true });
  await writeFile(CLIOPATRIA_FILE, entry.data);
  process.stdout.write(
    `  ↓ ${entry.name} (${(zip.length / 1024 / 1024).toFixed(0)} MB zipped` +
      ` -> ${(entry.data.length / 1024 / 1024).toFixed(0)} MB)\n`,
  );
}

console.log('\nNext: npm run data:build');
