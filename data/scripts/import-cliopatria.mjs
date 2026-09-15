// One-off importer: Cliopatria's polity extents -> polity files in
// data/polities/, for the post-Soviet Eurasia slice.
//
// This is not part of `npm run data:build`. It is run by hand, it overwrites
// the files named in SLICE, and what it writes is committed and then read like
// anything else in data/polities/. Nothing downstream knows the data came from
// here; the build sees ordinary spans with inline geometry.
//
// The trade it makes against authoring by hand:
//
//   · Cliopatria's dates are whole years, and its ToYear is inclusive. A span
//     therefore ends on 1 January of the following year, so the USSR dissolves
//     on 1992-01-01 rather than on 1991-12-26. Every span says so in its
//     `source`.
//   · Its extents are drawn per polity, not carved out of a shared bin, so
//     these spans carry inline `geometry` and cannot use parts.json. Borders
//     between two imported neighbours are two separate lines that happen to
//     coincide — which is why everything imported is simplified together on
//     one topology below, rather than a file at a time.
//   · It lets two polities hold the same ground. The build now warns rather
//     than failing on that (see data/README.md), which is what makes this
//     import possible at all.
//
// Cliopatria is CC BY 4.0: the attribution in MapControls names it, links the
// licence and says the geometry is modified, which it is — simplified, clipped
// to the coastline by the build, and re-dated as above.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { feature as topoFeature } from 'topojson-client';
import { CLIOPATRIA_FILE, POLITIES_DIR } from './lib/config.mjs';
import { simplifyGeometry } from './lib/geo.mjs';

/**
 * Visvalingam weight for the shared topology, in square degrees. The build
 * simplifies again at SIMPLIFY_WEIGHT on its own topology, so this one only
 * has to bring 158 MB of source geometry down to a diff a person can read.
 * Set it near the build's own weight and the committed files stay honest about
 * what will actually be drawn.
 */
const SIMPLIFY_WEIGHT = 0.0002;
/** Rings smaller than this are dropped, in square degrees; ~25 km². */
const MIN_AREA = 0.002;
/** Coordinate precision, matching the build's: about 11 m. */
const PRECISION = 1e4;
/**
 * A slice whose ToYear reaches this is still running, and is written as
 * `to: null` rather than as an end date the source did not mean. Cliopatria's
 * last year; raise it when the upstream release moves on.
 */
const LATEST_YEAR = 2024;
/** Nothing before this is imported: the slice starts at the USSR's founding. */
const FROM_YEAR = 1922;

/**
 * The slice, one entry per output file. `names` are Cliopatria `Name` values;
 * several map onto one file where the databank splits by regime what this map
 * holds as one polity — Estonia's interwar republic and its restoration, or
 * Lithuania under the two names the databank gives it. `name` is what the map
 * calls the polity across all of them.
 *
 * Colours are carried over from the hand-authored files this replaces, so the
 * region keeps the palette the rest of the map was balanced against.
 *
 * Cliopatria also carries parenthesised duplicates — `(Russian Federation)` —
 * for a polity counted together with its dependencies. They are deliberately
 * not listed: importing both would draw Russia twice on its own ground.
 */
const SLICE = [
  { id: 'ussr', name: 'Soviet Union', color: '#b8443f', names: ['Union of Soviet Socialist Republics'] },
  { id: 'russia', name: 'Russia', color: '#a8524c', names: ['Russian Federation'] },
  { id: 'ukraine', name: 'Ukraine', color: '#c8a24a', names: ['Ukraine'] },
  { id: 'belarus', name: 'Belarus', color: '#8f9a55', names: ['Republic of Belarus'] },
  { id: 'moldova', name: 'Moldova', color: '#7fa07a', names: ['Republic of Moldova'] },
  { id: 'estonia', name: 'Estonia', color: '#5b93a8', names: ['Estonia', 'Republic of Estonia'] },
  { id: 'latvia', name: 'Latvia', color: '#6f86b0', names: ['Republic of Latvia'] },
  { id: 'lithuania', name: 'Lithuania', color: '#8479ad', names: ['Kingdom of Lithuania', 'Republic of Lithuania'] },
  { id: 'georgia', name: 'Georgia', color: '#9c6f9e', names: ['Georgia'] },
  { id: 'armenia', name: 'Armenia', color: '#b06a86', names: ['Republic of Armenia'] },
  { id: 'azerbaijan', name: 'Azerbaijan', color: '#5f9c8e', names: ['Republic of Azerbaijan'] },
  { id: 'kazakhstan', name: 'Kazakhstan', color: '#4f8f9c', names: ['Kazakhstan'] },
  { id: 'kyrgyzstan', name: 'Kyrgyzstan', color: '#6b9370', names: ['Kyrgyzstan'] },
  { id: 'tajikistan', name: 'Tajikistan', color: '#7d9b5f', names: ['Republic of Tajikistan'] },
  { id: 'turkmenistan', name: 'Turkmenistan', color: '#96794c', names: ['Turkmenistan'] },
  { id: 'uzbekistan', name: 'Uzbekistan', color: '#a98a4e', names: ['Republic of Uzbekistan'] },
  // The two entries below are ground Cliopatria draws inside another polity's
  // extent. They are the reason the overlap check had to become a warning, and
  // they are drawn as `disputed` — held in fact, with the claim rejected.
  {
    id: 'chechnya',
    name: 'Chechen Republic of Ichkeria',
    color: '#9a8f5c',
    names: ['Chechen Republic'],
    status: 'disputed',
  },
  {
    id: 'russian-occupied-ukraine',
    name: 'Russian-occupied territories',
    color: '#8c6b62',
    names: ['Russian-occupied territories'],
    status: 'disputed',
  },
];

const source = JSON.parse(await readFile(CLIOPATRIA_FILE, 'utf8'));

/** Cliopatria Name -> the entry that wants it. */
const wanted = new Map();
for (const entry of SLICE) for (const name of entry.names) wanted.set(name, entry);

// --- collect ---------------------------------------------------------------
// Keyed by output file and start year, because one polity-slice may arrive as
// several features and has to be drawn as one shape.
const slices = new Map();
let considered = 0;
for (const f of source.features) {
  const p = f.properties;
  const entry = wanted.get(p.Name);
  if (!entry) continue;
  considered++;
  if (p.ToYear < FROM_YEAR) continue;
  const key = `${entry.id}@${p.FromYear}`;
  const slice = slices.get(key) ?? {
    key,
    entry,
    // The name the databank gives this slice, kept for the span's `source`.
    sourceName: p.Name,
    from: p.FromYear,
    to: p.ToYear,
    wikidata: p.Wikidata || null,
    polygons: [],
  };
  slice.to = Math.max(slice.to, p.ToYear);
  for (const polygon of f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]) {
    slice.polygons.push(polygon);
  }
  slices.set(key, slice);
}
console.log(
  `read ${source.features.length} Cliopatria feature(s)` +
    ` · ${considered} in the slice's polities · ${slices.size} from ${FROM_YEAR}`,
);
if (!slices.size) throw new Error('nothing matched — has an upstream Name changed?');

// --- simplify every slice at once, on a shared topology --------------------
// The same reasoning as the build's own pass: these shapes are drawn per
// polity, so Russia's western edge and Ukraine's eastern edge are two separate
// lines. Simplified separately they drift apart and leave a sliver down every
// frontier; simplified as one topology, a shared arc is simplified once.
const objects = {};
for (const [key, slice] of slices) {
  objects[key] = { type: 'MultiPolygon', coordinates: slice.polygons };
}
const topo = simplify(presimplify(topology(objects)), SIMPLIFY_WEIGHT);

const countVertices = (polygons) =>
  polygons.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
let before = 0;
let after = 0;
for (const [key, slice] of slices) {
  before += countVertices(slice.polygons);
  const geometry = simplifyGeometry(topoFeature(topo, topo.objects[key]).geometry, {
    // Already simplified on the topology; this drops specks and rounds.
    tolerance: 0,
    minArea: MIN_AREA,
    precision: PRECISION,
  });
  slice.geometry = geometry;
  if (geometry) {
    after += countVertices(
      geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates],
    );
  }
}
console.log(`simplified ${slices.size} slice(s) as one topology: ${before} -> ${after} vertices`);

/**
 * The house format for a polity file: the span's scalars on one line, its
 * geometry compact on the next, its `source` prose on the last. Plain
 * JSON.stringify with an indent puts every coordinate on its own line, which
 * turned this slice into 8.7 MB of mostly whitespace and made the files
 * unreadable in a diff. Matching data/non-state-peoples/ keeps an imported
 * file indistinguishable from a hand-authored one.
 */
function serialise(spec) {
  const spans = spec.features.map((span) => {
    const head = ['from', 'to', 'name', 'status']
      .filter((key) => key in span)
      .map((key) => `${JSON.stringify(key)}: ${JSON.stringify(span[key])}`)
      .join(', ');
    return (
      `    { ${head},\n` +
      `      "geometry": ${JSON.stringify(span.geometry)},\n` +
      `      "source": ${JSON.stringify(span.source)} }`
    );
  });
  return (
    `{\n  "name": ${JSON.stringify(spec.name)},\n` +
    `  "color": ${JSON.stringify(spec.color)},\n` +
    `  "features": [\n${spans.join(',\n')}\n  ]\n}\n`
  );
}

// --- write one file per polity ---------------------------------------------
const written = [];
for (const entry of SLICE) {
  const own = [...slices.values()]
    .filter((slice) => slice.entry === entry && slice.geometry)
    .sort((a, b) => a.from - b.from);
  if (!own.length) {
    console.log(`  ${entry.id}: nothing in range, skipped`);
    continue;
  }
  const spec = {
    name: entry.name,
    color: entry.color,
    features: own.map((slice) => {
      const open = slice.to >= LATEST_YEAR;
      const span = {
        from: String(Math.max(slice.from, FROM_YEAR)),
        // Cliopatria's ToYear is the last year the extent held, so the span
        // ends at the start of the next one — which is also what leaves no gap
        // before the following slice.
        to: open ? null : String(slice.to + 1),
      };
      // No span-level `name`. That field is for one file covering successive
      // historical entities, and which of the databank's names are a real
      // succession rather than its own house style — "Republic of Estonia",
      // "Kingdom of Lithuania" for the interwar republic — is a judgement no
      // importer can make. The name it used is recorded in `source` below;
      // promoting one to a span name is a hand edit afterwards.
      if (entry.status) span.status = entry.status;
      span.geometry = slice.geometry;
      span.source =
        `Cliopatria slice "${slice.sourceName}" ${slice.from}–${slice.to}` +
        (open ? ', still current' : '') +
        `. Whole-year dates: the span ends on 1 January ${slice.to + 1}` +
        ` because the databank records ${slice.to} as the last year of this extent.` +
        (slice.wikidata ? ` Wikidata ${slice.wikidata}.` : '');
      return span;
    }),
  };
  const path = join(POLITIES_DIR, `${entry.id}.json`);
  await writeFile(path, serialise(spec));
  written.push({ id: entry.id, spans: spec.features.length, path });
}

const sizes = await Promise.all(
  written.map(async (w) => (await readFile(w.path)).length),
);
console.log(
  `\nwrote ${written.length} file(s) · ${written.reduce((n, w) => n + w.spans, 0)} span(s)` +
    ` · ${(sizes.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(1)} MB`,
);
for (const [i, w] of written.entries()) {
  console.log(`  ${w.id}: ${w.spans} span(s), ${(sizes[i] / 1024).toFixed(0)} KB`);
}
console.log('\nNext: npm run data:polities');
