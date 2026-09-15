// Cliopatria -> data/polities/, as a dump. Run by hand, never as part of a
// build, and it **overwrites the whole directory**.
//
// This script makes no editorial decisions. One Cliopatria `Name` becomes one
// file, its slices become that file's spans, and the databank's own name is
// what the polity is called. Nothing is selected, merged, renamed, recoloured
// or clipped to a region here.
//
// That is the division of labour: the dump is mechanical, and
// curate-polities.mjs is where the judgement lives. Grouping the four
// Bulgarias into one country, deciding "Kingdom of Great Britain" should read
// as "Britain", giving a polity a colour that works against its neighbours —
// none of it is derivable from the source, all of it is revisable, and all of
// it happens afterwards against files already in the repository rather than
// against a 158 MB GeoJSON.
//
// Re-running the dump discards curation. The rules that produce it live in
// data/curation.json, so the sequence is: dump, then curate.
//
// What the databank cannot say, and so neither can this:
//
//   · Dates are whole years and `ToYear` is inclusive, so a span ends on
//     1 January of the following year. The USSR dissolves on 1992-01-01, not
//     on 1991-12-26.
//   · Extents are drawn per polity rather than carved from a shared bin, so
//     every span carries inline `geometry`. Two neighbours meet only as
//     closely as they were drawn, which is why everything is simplified
//     together on one topology below rather than a file at a time.
//   · Two polities may hold the same ground. The build warns rather than
//     failing on that, which is what makes this import possible at all.
//
// Cliopatria is CC BY 4.0: the attribution in MapControls names it, links the
// licence, and says the geometry is modified — which it is, simplified here
// and clipped to the coastline by the build.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { feature as topoFeature } from 'topojson-client';
import { CLIOPATRIA_FILE, POLITIES_DIR } from './lib/config.mjs';
import { simplifyGeometry } from './lib/geo.mjs';
import { serialisePolity, slugify } from './lib/polity-file.mjs';

/**
 * Visvalingam weight for the shared topology, in square degrees. The build
 * simplifies again on its own topology, so this pass only has to bring the
 * source down to files a person can diff. Cliopatria's geometry is already
 * coarse — roughly 24 km between vertices — so this removes little.
 */
const SIMPLIFY_WEIGHT = 0.0002;
/** Rings smaller than this are dropped, in square degrees; ~25 km². */
const MIN_AREA = 0.002;
/** Coordinate precision, matching the build's: about 11 m. */
const PRECISION = 1e4;
/**
 * A slice reaching this is still running and is written `to: null` rather than
 * given an end date the source did not mean. Cliopatria's last year; raise it
 * when the upstream release moves on.
 */
const LATEST_YEAR = 2024;

/**
 * Hue step for generated colours. A large coprime step means ids that land
 * near each other in the hash space come out far apart on the wheel, so
 * neighbouring polities do not share a colour by accident.
 */
const HUE_STEP = 137;
/** Saturation and lightness of a generated colour, matching the map's palette. */
const COLOR_SATURATION = 0.33;
const COLOR_LIGHTNESS = 0.47;

/**
 * A colour for a polity nobody has chosen one for. Derived from the id, so a
 * dump run twice produces byte-identical files, and overridden in
 * data/curation.json wherever a polity deserves better.
 */
function generatedColor(id) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const hue = ((hash % 360) * HUE_STEP) % 360;
  const c = (1 - Math.abs(2 * COLOR_LIGHTNESS - 1)) * COLOR_SATURATION;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = COLOR_LIGHTNESS - c / 2;
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][Math.floor(hue / 60) % 6];
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const source = JSON.parse(await readFile(CLIOPATRIA_FILE, 'utf8'));

// --- collect ---------------------------------------------------------------
// One bucket per Cliopatria Name; within it, one slice per start year, because
// a polity-slice may arrive as more than one feature.
//
// Two kinds of feature are skipped. `RELATION` is an alliance rather than
// ground held, and importing one would draw a diplomatic tie as territory.
// A parenthesised name — `(Spanish Empire)` — is a polity counted together
// with its dependencies, and its ground is already drawn by the unparenthesised
// entries it is made of. Those names survive as `cliopatria.memberOf`, where
// they are the one grouping key the databank does give us.
const polities = new Map();
let relations = 0;
let aggregates = 0;
for (const f of source.features) {
  const p = f.properties;
  if (p.Type !== 'POLITY') {
    relations++;
    continue;
  }
  if (p.Name.startsWith('(')) {
    aggregates++;
    continue;
  }

  const id = slugify(p.Name);
  let polity = polities.get(id);
  if (!polity) {
    polity = {
      id,
      name: p.Name,
      // Everything the databank knows about this polity that is not its shape,
      // carried into the file so curation can work from the repository rather
      // than from the source GeoJSON.
      meta: {
        name: p.Name,
        wikipedia: p.Wikipedia || null,
        wikidata: p.Wikidata || null,
        seshat: p.SeshatID || null,
        memberOf: p.MemberOf || null,
      },
      slices: new Map(),
    };
    polities.set(id, polity);
  }

  let slice = polity.slices.get(p.FromYear);
  if (!slice) {
    slice = { key: `${id}@${p.FromYear}`, from: p.FromYear, to: p.ToYear, polygons: [] };
    polity.slices.set(p.FromYear, slice);
  }
  slice.to = Math.max(slice.to, p.ToYear);
  const geom = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const polygon of geom) slice.polygons.push(polygon);
}

const sliceCount = [...polities.values()].reduce((n, p) => n + p.slices.size, 0);
console.log(
  `read ${source.features.length} feature(s) · skipped ${relations} relation(s)` +
    ` and ${aggregates} with-dependencies duplicate(s)` +
    `\n${polities.size} polities · ${sliceCount} slices`,
);

// --- simplify every slice at once, on a shared topology --------------------
// One topology, not one per polity: a frontier two polities were drawn to
// share is a single arc here, simplified once. Simplify them separately and
// the same line simplifies two ways, leaving a sliver down every border.
const objects = {};
for (const polity of polities.values()) {
  for (const slice of polity.slices.values()) {
    objects[slice.key] = { type: 'MultiPolygon', coordinates: slice.polygons };
  }
}
console.log(`\nsimplifying ${Object.keys(objects).length} slice(s) as one topology…`);
const topo = simplify(presimplify(topology(objects)), SIMPLIFY_WEIGHT);

const countVertices = (polygons) =>
  polygons.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
let before = 0;
let after = 0;
let empty = 0;
for (const polity of polities.values()) {
  for (const slice of polity.slices.values()) {
    before += countVertices(slice.polygons);
    const geometry = simplifyGeometry(topoFeature(topo, topo.objects[slice.key]).geometry, {
      // Already simplified on the topology; this drops specks and rounds.
      tolerance: 0,
      minArea: MIN_AREA,
      precision: PRECISION,
    });
    slice.geometry = geometry;
    if (!geometry) {
      empty++;
      continue;
    }
    after += countVertices(
      geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates],
    );
  }
}
console.log(
  `simplified: ${before} -> ${after} vertices` +
    (empty ? ` · ${empty} slice(s) left nothing after dropping specks` : ''),
);

// --- write -----------------------------------------------------------------
// The directory is emptied first. This script owns it: a name that disappears
// upstream has to disappear here too, or the map goes on drawing a polity the
// databank no longer has.
await mkdir(POLITIES_DIR, { recursive: true });
const existing = (await readdir(POLITIES_DIR)).filter((n) => n.endsWith('.json'));
for (const name of existing) await rm(join(POLITIES_DIR, name));
if (existing.length) console.log(`\ncleared ${existing.length} existing file(s)`);

let written = 0;
let spans = 0;
let bytes = 0;
for (const polity of [...polities.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const own = [...polity.slices.values()]
    .filter((slice) => slice.geometry)
    .sort((a, b) => a.from - b.from);
  if (!own.length) continue;
  const text = serialisePolity({
    name: polity.name,
    color: generatedColor(polity.id),
    cliopatria: polity.meta,
    features: own.map((slice) => ({
      from: String(slice.from),
      // `ToYear` is the last year the extent held, so the span ends at the
      // start of the next — which is also what leaves no gap before the
      // following slice.
      to: slice.to >= LATEST_YEAR ? null : String(slice.to + 1),
      geometry: slice.geometry,
    })),
  });
  await writeFile(join(POLITIES_DIR, `${polity.id}.json`), text);
  written++;
  spans += own.length;
  bytes += text.length;
}

console.log(`\nwrote ${written} file(s) · ${spans} span(s) · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log('\nNext: npm run data:curate');
