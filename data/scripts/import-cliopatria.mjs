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
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import polygonClipping from 'polygon-clipping';
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
/** Nothing before this is imported. */
const FROM_YEAR = 1900;

/**
 * The region drawn. Every imported shape is cut to this box, because a
 * Cliopatria polity is its whole extent: "Kingdom of Portugal" includes Angola
 * and "Free French" includes equatorial Africa. Importing those whole would
 * paint isolated blobs across continents this map does not otherwise cover.
 * The cut is recorded in each span's `source` where it removed anything.
 *
 * [west, south, east, north]. The southern edge sits above the North African
 * coast; a colonial span that reached Morocco or Algeria keeps only whatever
 * fell north of it.
 */
const CLIP = [-25, 35.5, 190, 82];

/**
 * The slice, one entry per output file: which Cliopatria `Name`s become which
 * polity, under what name and colour. A file may name several, where the
 * databank splits by regime what this map holds as one continuing identity —
 * Bulgaria's principality, kingdom, people's republic and republic are four
 * names for the ground one file draws.
 *
 * A name may carry its own year window, for the cases where the databank runs
 * one name past the point another takes over: `Estado Novo` is recorded to
 * 2024 alongside `Portugal` from 1976, and without the window the two would be
 * drawn on the same ground for fifty years.
 *
 * Parenthesised names — `(Russian Federation)`, `(British Empire)` — are the
 * polity counted together with its dependencies, and are never listed: they
 * duplicate the ground their unparenthesised twin already draws.
 *
 * Colours are carried over from the hand-authored files this replaces wherever
 * an id survived, so the map keeps the palette it was balanced against.
 */
const SLICE = [
  // --- Russia and the Soviet Union ---
  { id: 'russian-empire', name: 'Russian Empire', color: '#8f4a56', names: ['Russian Empire', 'Russian Republic'] },
  { id: 'ussr', name: 'Soviet Union', color: '#b8443f', names: ['Republics of the Soviet Union', 'Union of Soviet Socialist Republics'] },
  { id: 'russia', name: 'Russia', color: '#a8524c', names: ['Russian Federation'] },
  { id: 'priamurye', name: 'Provisional Priamurye Government', color: '#96604f', names: ['Provisional Priamurye Government'] },
  { id: 'tuva', name: 'Uryankhay', color: '#7f8a5c', names: ['Republic of Uryankhay'] },

  // --- the Soviet successor states ---
  { id: 'ukraine', name: 'Ukraine', color: '#c8a24a', names: ['Ukrainian People\'s Republic', 'Ukraine'] },
  { id: 'belarus', name: 'Belarus', color: '#8f9a55', names: ['Republic of Belarus'] },
  { id: 'moldova', name: 'Moldova', color: '#7fa07a', names: ['Republic of Moldova'] },
  { id: 'estonia', name: 'Estonia', color: '#5b93a8', names: ['Estonia', 'Republic of Estonia'] },
  { id: 'latvia', name: 'Latvia', color: '#6f86b0', names: ['Republic of Latvia'] },
  { id: 'lithuania', name: 'Lithuania', color: '#8479ad', names: ['Kingdom of Lithuania', 'Republic of Lithuania'] },
  { id: 'georgia', name: 'Georgia', color: '#9c6f9e', names: ['Georgia'] },
  { id: 'armenia', name: 'Armenia', color: '#b06a86', names: ['Armenia', 'Republic of Armenia'] },
  { id: 'azerbaijan', name: 'Azerbaijan', color: '#5f9c8e', names: ['Azerbaijan Democratic Republic', 'Republic of Azerbaijan'] },
  { id: 'kazakhstan', name: 'Kazakhstan', color: '#4f8f9c', names: ['Kazakhstan'] },
  { id: 'kyrgyzstan', name: 'Kyrgyzstan', color: '#6b9370', names: ['Kyrgyzstan'] },
  { id: 'tajikistan', name: 'Tajikistan', color: '#7d9b5f', names: ['Republic of Tajikistan'] },
  { id: 'turkmenistan', name: 'Turkmenistan', color: '#96794c', names: ['Turkmenistan'] },
  { id: 'uzbekistan', name: 'Uzbekistan', color: '#a98a4e', names: ['Republic of Uzbekistan'] },
  { id: 'bukhara', name: 'Emirate of Bukhara', color: '#b09a5e', names: ['Emirate of Bukhara'] },
  { id: 'khiva', name: 'Khanate of Khiva', color: '#a8905f', names: ['Khanate of Khiva'] },
  { id: 'chechnya', name: 'Chechen Republic of Ichkeria', color: '#9a8f5c', names: ['Chechen Republic'], status: 'disputed' },
  { id: 'russian-occupied-ukraine', name: 'Russian-occupied territories', color: '#8c6b62', names: ['Russian-occupied territories'], status: 'disputed' },

  // --- central Europe ---
  { id: 'german-empire', name: 'German Empire', color: '#6f5f9c', names: ['German Empire'] },
  { id: 'germany', name: 'Germany', color: '#8870ad', names: ['Weimar Republic', 'Nazi Germany', 'Federal Republic of Germany', 'Federated Republic of Germany'] },
  { id: 'east-germany', name: 'East Germany', color: '#9c6f8a', names: ['German Democratic Republic'] },
  { id: 'austria-hungary', name: 'Austria-Hungary', color: '#c0705e', names: ['Austria-Hungary'] },
  { id: 'austria', name: 'Austria', color: '#c87563', names: ['Republic of Austria', 'Second Republic of Austria'] },
  { id: 'switzerland', name: 'Switzerland', color: '#b75d62', names: ['Swiss Confederation'] },
  { id: 'poland', name: 'Poland', color: '#bd6870', names: ['Second Polish Republic', 'Republic of Poland'] },
  { id: 'danzig', name: 'Free City of Danzig', color: '#a87f8a', names: ['Free City of Danzig'] },
  { id: 'czechoslovakia', name: 'Czechoslovakia', color: '#4f6f9c', names: ['Czechoslovakia'] },
  { id: 'czechia', name: 'Czechia', color: '#587eae', names: ['Czech Republic'] },
  { id: 'slovakia', name: 'Slovakia', color: '#6687af', names: ['Slovakia'] },
  { id: 'hungary', name: 'Hungary', color: '#a45d73', names: ['Hungarian Republic', 'Hungarian People\'s Republic', 'Hungary'] },

  // --- western Europe ---
  { id: 'britain', name: 'Britain', color: '#93566b', adjective: 'British', names: ['Kingdom of Great Britain'] },
  { id: 'ireland', name: 'Ireland', color: '#63936d', names: ['Irish Free State', 'Éire'] },
  { id: 'france', name: 'France', color: '#5c76b0', adjective: 'French', names: ['French Third Republic', 'French Fourth Republic', 'French Fifth Republic'] },
  { id: 'vichy-france', name: 'Vichy France', color: '#7f7f8f', names: ['Vichy France'] },
  { id: 'spain', name: 'Spain', color: '#c98a3f', adjective: 'Spanish', names: ['Kingdom of Spain', 'Second Spanish Republic', 'Francoist Spain'] },
  { id: 'spanish-nationalists', name: 'Spanish Nationalists', color: '#a86a3f', names: ['Spanish Nationalists'] },
  { id: 'portugal', name: 'Portugal', color: '#8c6a49', adjective: 'Portuguese', names: ['Kingdom of Portugal', { name: 'Estado Novo', to: 1975 }, 'Portugal'] },
  { id: 'italy', name: 'Italy', color: '#6f9b62', adjective: 'Italian', names: ['Kingdom of Italy', 'Republic of Italy'] },
  { id: 'netherlands', name: 'Netherlands', color: '#d08a4a', adjective: 'Dutch', names: ['Netherlands'] },
  { id: 'belgium', name: 'Belgium', color: '#b48a42', names: ['Kingdom of Belgium'] },
  { id: 'luxembourg', name: 'Luxembourg', color: '#5e99a2', names: ['Luxembourg'] },
  { id: 'andorra', name: 'Andorra', color: '#8c6bb1', names: ['Principality of Andorra'] },
  { id: 'monaco', name: 'Monaco', color: '#b95d74', names: ['Kingdom of Monaco', 'Principality of Monaco'] },

  // --- the north ---
  { id: 'sweden-norway', name: 'Sweden-Norway', color: '#5f8fa8', names: ['United Kingdoms of Sweden and Norway'] },
  { id: 'sweden', name: 'Sweden', color: '#4f9ab5', names: ['Kingdom of Sweden'] },
  { id: 'norway', name: 'Norway', color: '#a15d68', names: ['Kingdom of Norway'] },
  { id: 'denmark', name: 'Denmark', color: '#a8617f', adjective: 'Danish', names: ['Denmark-Norway', 'Denmark'] },
  { id: 'iceland', name: 'Iceland', color: '#6379ad', names: ['Kingdom of Iceland', 'Republic of Iceland'] },
  { id: 'finland', name: 'Finland', color: '#5a91a8', names: ['Republic of Finland'] },

  // --- the Balkans and the Black Sea ---
  { id: 'yugoslavia', name: 'Yugoslavia', color: '#7a6f4f', names: ['Yugoslavia', 'Socialist Federal Republic of Yugoslavia'] },
  { id: 'serbia', name: 'Serbia', color: '#af5b64', names: ['Serbs', 'Serbia', 'Serbia-Montenegro'] },
  { id: 'montenegro', name: 'Montenegro', color: '#9b704b', names: ['Montenegro'] },
  { id: 'croatia', name: 'Croatia', color: '#b86669', names: ['Independent State of Croatia', 'Republic of Croatia'] },
  { id: 'bosnia-and-herzegovina', name: 'Bosnia and Herzegovina', color: '#718c51', names: ['Bosnia and Herzegovina'] },
  { id: 'slovenia', name: 'Slovenia', color: '#6d9c7e', names: ['Republic of Slovenia'] },
  { id: 'north-macedonia', name: 'North Macedonia', color: '#ad7e4f', names: ['Former Yugoslav Republic of Macedonia'] },
  { id: 'kosovo', name: 'Kosovo', color: '#b8894e', names: ['Kosovo'] },
  { id: 'albania', name: 'Albania', color: '#b85b5b', names: ['Albania', 'People\'s Socialist Republic of Albania', 'Republic of Albania'] },
  { id: 'greece', name: 'Greece', color: '#4d86b8', names: ['First Hellenic Republic', 'Kingdom of Greece', 'Greek junta', 'Third Hellenic Republic'] },
  { id: 'crete', name: 'Cretan State', color: '#6f9cb8', names: ['Cretan State'] },
  { id: 'bulgaria', name: 'Bulgaria', color: '#7a9e85', names: ['Principality of Bulgaria', 'Kingdom of Bulgaria', 'People\'s Republic of Bulgaria', 'Republic of Bulgaria'] },
  { id: 'romania', name: 'Romania', color: '#b58b43', names: ['United Principalities of Moldavia and Wallachia', 'Kingdom of Romania', 'Socialist Republic of Romania', 'Romania'] },
  { id: 'turkey', name: 'Turkey', color: '#b86658', adjective: 'Turkish', names: ['Ottoman Empire', 'Republic of Turkey'] },
  { id: 'cyprus', name: 'Cyprus', color: '#5f9cae', names: ['Republic of Cyprus'] },
  { id: 'northern-cyprus', name: 'Northern Cyprus', color: '#b07f6a', names: ['Turkish Republic of Northern Cyprus'], status: 'disputed' },
  { id: 'malta', name: 'Malta', color: '#c17255', names: ['Malta'] },
];

const source = JSON.parse(await readFile(CLIOPATRIA_FILE, 'utf8'));

/** Cliopatria Name -> the entry that wants it, and the years it wants. */
const wanted = new Map();
for (const entry of SLICE) {
  for (const name of entry.names) {
    const spec = typeof name === 'string' ? { name } : name;
    if (wanted.has(spec.name)) {
      throw new Error(`"${spec.name}" is claimed by two entries — it can only build one file`);
    }
    wanted.set(spec.name, { entry, from: spec.from ?? -Infinity, to: spec.to ?? Infinity });
  }
}

/** The clip box as a polygon, for polygon-clipping. */
const CLIP_POLYGON = [[
  [CLIP[0], CLIP[1]], [CLIP[2], CLIP[1]], [CLIP[2], CLIP[3]], [CLIP[0], CLIP[3]], [CLIP[0], CLIP[1]],
]];

// --- collect ---------------------------------------------------------------
// Keyed by output file and start year, because one polity-slice may arrive as
// several features and has to be drawn as one shape.
const slices = new Map();
let considered = 0;
let clipped = 0;
for (const f of source.features) {
  const p = f.properties;
  const claim = wanted.get(p.Name);
  if (!claim) continue;
  const { entry } = claim;
  considered++;
  if (p.ToYear < FROM_YEAR) continue;
  // A name may be wanted only for part of its run, where the databank keeps it
  // going past the point the next name takes over.
  if (p.ToYear < claim.from || p.FromYear > claim.to) continue;

  // Cut to the region. Everything this map draws of a polity is what fell
  // inside; a colonial extent keeps its metropole and loses its colonies.
  const whole = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const inside = polygonClipping.intersection(whole, CLIP_POLYGON);
  if (!inside.length) continue;
  if (inside.length !== whole.length) clipped++;

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
  slice.to = Math.min(Math.max(slice.to, p.ToYear), claim.to);
  slice.cut = slice.cut || inside.length !== whole.length;
  for (const polygon of inside) slice.polygons.push(polygon);
  slices.set(key, slice);
}
console.log(
  `read ${source.features.length} Cliopatria feature(s)` +
    ` · ${considered} in the slice's polities · ${slices.size} from ${FROM_YEAR}` +
    ` · ${clipped} cut to the region`,
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
    (spec.adjective ? `  "adjective": ${JSON.stringify(spec.adjective)},\n` : '') +
    `  "color": ${JSON.stringify(spec.color)},\n` +
    `  "features": [\n${spans.join(',\n')}\n  ]\n}\n`
  );
}

// --- write one file per polity ---------------------------------------------
await mkdir(POLITIES_DIR, { recursive: true });
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
    ...(entry.adjective ? { adjective: entry.adjective } : {}),
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
        (slice.cut ? ' Cut to the region this map draws; ground outside it is not shown.' : '') +
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
