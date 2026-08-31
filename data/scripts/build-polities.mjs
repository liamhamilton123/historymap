// One file per polity -> one flat collection of "this shape, this polity, this
// span of time". Every feature is independent; nothing is joined at runtime.
// The map draws it with a single filter on the current instant.
//
// It ships as TopoJSON so that the outlines those features share are stored
// once rather than once per span — see the write step at the bottom.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import polygonClipping from 'polygon-clipping';
import polylabel from 'polylabel';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { feature as topoFeature } from 'topojson-client';
import { SOURCES_DIR, OUT_DIR, POLITIES_DIR, UNCLAIMED_DIR, PARTS_FILE, NATURAL_EARTH_PARTS } from './lib/config.mjs';
import { simplifyGeometry } from './lib/geo.mjs';
import { writeVectorTiles } from './lib/vector-tiles.mjs';

/**
 * Visvalingam weight, in square degrees. Simplification is deliberately global
 * rather than per polity: it runs on a shared topology, so a border between
 * two neighbours is one arc simplified once. Give each side its own tolerance
 * and the same border simplifies two ways, leaving slivers along every
 * frontier — which is exactly what the overlap check below reports.
 */
const SIMPLIFY_WEIGHT = 0.0002;
/** Polygons smaller than this are dropped. Square degrees; ~25 km². */
const MIN_AREA = 0.002;
/**
 * Coordinate precision, in degrees — about 11 m. Geometry is rounded to this,
 * and the TopoJSON quantisation grid at the end is sized to it, so the two
 * cannot drift and start writing out each other's rounding noise.
 */
const PRECISION = 1e-4;
/**
 * Below this, an overlap between two polities is arithmetic noise rather than
 * a modelling mistake. Square degrees; roughly a tenth of a square km.
 */
const OVERLAP_EPSILON = 1e-5;
/** Stands in for `to: null` so the runtime filter is a plain numeric compare. */
const OPEN_ENDED = 9999;
/** Days elapsed before the 1st of each month; leap years ignored on purpose. */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

const SQ_DEG_TO_SQ_KM = 111 * 111;

/**
 * Sets how early a label appears: a polity shows its name once its extent is
 * roughly a fixed fraction of the viewport, so Russia is labelled from the
 * first zoom level and Armenia only once you are looking at the Caucasus.
 * Raise it to label more at once, at the cost of crowding.
 */
const LABEL_ZOOM_CONSTANT = 90;
/** Precision of the label anchor search, in degrees. */
const LABEL_PRECISION = 0.05;

/**
 * How a span is drawn. The styling itself lives in one place, POLITY_STATUS in
 * src/lib/mapStyle.ts — this list only exists so a typo is a build failure
 * rather than a territory that silently renders as undisputed. Keep in step.
 */
const STATUSES = ['controlled', 'disputed', 'contested'];
const DEFAULT_STATUS = 'controlled';
/**
 * The one status that may share ground. Every other overlap is a mistake; two
 * spans that are both `contested` are the map saying "these polities each claim
 * this", which is a thing the world does and the model has to be able to say.
 */
const SHARED_STATUS = 'contested';

/**
 * ISO date -> decimal year. The fractional part only has to order events
 * within a year, not survive a calendar reform.
 * Mirrored by parseInstant in src/lib/time.ts — change both together.
 */
function toInstant(iso) {
  if (iso == null) return OPEN_ENDED;
  const match = /^(-?\d{1,6})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(iso).trim());
  if (!match) throw new Error(`unparseable date: ${iso}`);
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  return year + (MONTH_START[month - 1] + day - 1) / 365;
}

/** Decimal year -> the shortest ISO form, for reporting. */
function formatInstant(t) {
  const year = Math.floor(t);
  const days = Math.round((t - year) * 365);
  if (days <= 0) return String(year);
  let month = 12;
  while (month > 1 && MONTH_START[month - 1] > days) month--;
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(days - MONTH_START[month - 1] + 1)}`;
}

/** Every polygon of a Polygon or MultiPolygon, as a flat list. */
function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/** True when every vertex of a polygon's outer ring is inside [w, s, e, n]. */
function polygonWithin(polygon, [w, s, e, n]) {
  return polygon[0].every(([x, y]) => x >= w && x <= e && y >= s && y <= n);
}

/** [w, s, e, n] of a list of polygons. */
function bboxOf(polygons) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0]) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return [w, s, e, n];
}

const bboxesDisjoint = (a, b) => a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1];

/** Total area of a list of polygons, in square degrees, holes subtracted. */
function areaOf(polygons) {
  let total = 0;
  for (const polygon of polygons) {
    polygon.forEach((ring, index) => {
      let sum = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
      }
      total += (index === 0 ? 1 : -1) * Math.abs(sum / 2);
    });
  }
  return total;
}

const problems = [];
const km2 = (sqDeg) => `${(sqDeg * SQ_DEG_TO_SQ_KM).toFixed(0)} km²`;

/**
 * Whether a span's label says who holds the ground — by the polity's name, or
 * by the adjective its possessions are conventionally named with, so that
 * "British North America" counts as saying Britain without having to spell it
 * "North America (Britain)".
 */
function namesOwner(label, spec) {
  const text = label.toLowerCase();
  return [spec.name, spec.id, spec.adjective]
    .filter(Boolean)
    .some((form) => text.includes(String(form).toLowerCase()));
}

// --- the parts bin: modern countries, then the pieces carved out of them ----
const parts = new Map();
const partsPath = join(SOURCES_DIR, 'naturalearth', `${NATURAL_EARTH_PARTS}.geojson`);
for (const ne of JSON.parse(await readFile(partsPath, 'utf8')).features) {
  parts.set(ne.properties.ADM0_A3, polygonsOf(ne.geometry));
}

// Carving is the single idea: a part is taken out of its source, and the source
// keeps the remainder. Nothing is ever in two parts at once, so a polity
// assembled from parts can neither overlap another nor leave a seam. Specs are
// applied in file order, each carving from whatever its source has left.
const partSpec = JSON.parse(await readFile(PARTS_FILE, 'utf8')).parts ?? {};
for (const [id, spec] of Object.entries(partSpec)) {
  const source = parts.get(spec.source);
  if (!source?.length) {
    problems.push(`parts.json: "${id}" has no source "${spec.source}" left to carve`);
    continue;
  }

  let taken;
  let remainder;
  if (spec.clip) {
    // Cutting against a drawn shape. The cut is exact even when that shape is
    // rough, because the part keeps the source's own coastline everywhere
    // except along the cut itself — and the remainder gets the identical cut.
    const clip = polygonsOf(spec.clip);
    if (!clip.length) {
      problems.push(`parts.json: "${id}" has an unusable clip geometry`);
      continue;
    }
    taken = polygonClipping.intersection(source, clip);
    remainder = polygonClipping.difference(source, clip);
  } else if (spec.within) {
    // Whole polygons inside a box. Cheaper, and exact when the piece already
    // stands alone as an island or peninsula that NE draws separately.
    taken = source.filter((polygon) => polygonWithin(polygon, spec.within));
    remainder = source.filter((polygon) => !taken.includes(polygon));
  } else {
    problems.push(`parts.json: "${id}" needs either "clip" or "within"`);
    continue;
  }

  if (!taken.length) {
    problems.push(`parts.json: "${id}" selected nothing out of ${spec.source}`);
    continue;
  }
  parts.set(id, taken);
  parts.set(spec.source, remainder);
  console.log(
    `  ${id}: carved out of ${spec.source} · ${km2(areaOf(taken))} · ${remainder.length} polygon(s) left`,
  );
}

// --- specs: the filename is the id -----------------------------------------
// Two kinds of file, assembled identically. A polity holds ground; an
// unclaimed region is ground with a name and nobody holding it. They share one
// id space and one overlap check precisely because they are alternatives for
// the same slot: ground is held by one polity, or by none and then named.
const SOURCES = [
  { dir: POLITIES_DIR, kind: 'polity' },
  { dir: UNCLAIMED_DIR, kind: 'unclaimed' },
];
const specs = [];
const used = new Set();
const seenIds = new Map();
/** Part keys that came from an inline `geometry` rather than the parts bin. */
const inlineParts = new Set();

for (const { dir, kind } of SOURCES) {
  const files = (await readdir(dir).catch(() => [])).filter((name) => name.endsWith('.json')).sort();
  for (const file of files) {
  const id = basename(file, '.json');
  const spec = JSON.parse(await readFile(join(dir, file), 'utf8'));
  spec.id = id;
  spec.file = file;
  spec.kind = kind;
  if (seenIds.has(id)) problems.push(`${file}: id "${id}" is already used by ${seenIds.get(id)}`);
  seenIds.set(id, file);
  spec.entries = spec.features ?? [];
  if (kind === 'unclaimed' && spec.color) {
    problems.push(`${file}: unclaimed ground cannot have a colour — it has no owner to be coloured by`);
  }
  specs.push(spec);
  spec.entries.forEach((entry, index) => {
    if (entry.geometry) {
      // Inline shapes join the topology too, so one drawn to meet a
      // neighbour's coordinates keeps meeting it after simplification.
      const key = `${id}#${index}`;
      parts.set(key, polygonsOf(entry.geometry));
      entry.partKeys = [key];
      used.add(key);
      // Drawn freehand rather than carved out of a source, so nothing
      // guarantees it misses its neighbours the way a part does. The overlap
      // check has to fall back to real geometry for these.
      inlineParts.add(key);
      return;
    }
    entry.partKeys = entry.parts ?? [];
    for (const code of entry.partKeys) {
      if (!parts.has(code)) problems.push(`${file}: no part "${code}"`);
      else used.add(code);
    }
  });
  }
}

// --- simplify every part at once, on a shared topology ---------------------
const objects = {};
for (const id of used) objects[id] = { type: 'MultiPolygon', coordinates: parts.get(id) };
const topo = simplify(presimplify(topology(objects)), SIMPLIFY_WEIGHT);
const simplified = new Map();
for (const id of used) simplified.set(id, polygonsOf(topoFeature(topo, topo.objects[id]).geometry));
const countVertices = (map) =>
  [...map.values()].reduce((n, polys) => n + polys.reduce((m, p) => m + p.reduce((k, r) => k + r.length, 0), 0), 0);
const before = countVertices(new Map([...used].map((id) => [id, parts.get(id)])));
console.log(
  `\n  simplified ${used.size} part(s) as one topology:` +
    ` ${before} -> ${countVertices(simplified)} vertices`,
);

// --- assemble the features -------------------------------------------------
const features = [];
const featureParts = [];
for (const spec of specs) {
  let kept = 0;
  for (const entry of spec.entries) {
    const assembled = entry.partKeys.flatMap((code) => simplified.get(code) ?? []);
    if (!assembled.length) {
      problems.push(`${spec.file}: ${entry.from} has no geometry`);
      continue;
    }

    // Dissolve. A polity is one entity, so the seams between the parts it was
    // assembled from are an artefact of the assembly and must not be drawn —
    // otherwise the USSR shows internal republic borders. This is only exact
    // because the parts were simplified on a shared topology and so meet
    // exactly; union on independently simplified parts would leave slivers.
    const polygons = entry.partKeys.length > 1 ? polygonClipping.union(assembled) : assembled;

    // Already simplified; this only drops specks and rounds coordinates.
    // Both sides of a shared arc get the same treatment, so no seam appears.
    const geometry = simplifyGeometry(
      { type: 'MultiPolygon', coordinates: polygons },
      { tolerance: 0, minArea: spec.minArea ?? MIN_AREA, precision: 1 / PRECISION },
    );
    if (!geometry) {
      problems.push(`${spec.file}: ${entry.from} has nothing left after dropping specks`);
      continue;
    }

    const from = toInstant(entry.from);
    const to = toInstant(entry.to);
    if (!(to > from)) problems.push(`${spec.file}: ${entry.from} ends (${entry.to}) before it starts`);

    // An unclaimed region has no owner, so it has neither a colour — colour on
    // this map means identity — nor a status, which only says how an owner
    // holds something. Saying otherwise in the file is a mistake worth naming.
    const unclaimed = spec.kind === 'unclaimed';
    let status = entry.status ?? spec.status ?? DEFAULT_STATUS;
    if (unclaimed) {
      if (entry.status ?? spec.status) {
        problems.push(`${spec.file}: unclaimed ground cannot have a status`);
      }
      status = null;
    } else if (!STATUSES.includes(status)) {
      problems.push(`${spec.file}: ${entry.from} has unknown status "${status}"`);
    }

    // A label replaces the polity's name on the map, which is exactly where a
    // possession stops looking like a possession: "Jamaica" in Britain's colour
    // does not say whose it is. So a renamed span has to name its owner, either
    // the way history already does it — "British North America", "New Spain" —
    // or by saying so outright, "Louisiana (France)". Unclaimed ground is
    // exempt: it has no owner to name.
    if (!unclaimed && entry.label && !namesOwner(entry.label, spec)) {
      problems.push(
        `${spec.file}: "${entry.label}" does not say whose it is — name the owner,` +
          ` as "${entry.label} (${spec.name ?? spec.id})" or with "${spec.adjective ?? spec.name ?? spec.id}"`,
      );
    }

    features.push({
      type: 'Feature',
      properties: {
        // Which of the two kinds of file this came from. The style needs it to
        // keep unclaimed ground out of the layers that colour by owner.
        kind: spec.kind,
        // The id of whatever occupies this ground: a polity, or the name given
        // to ground that no polity held.
        polity: spec.id,
        name: spec.name ?? spec.id,
        color: unclaimed ? null : spec.color ?? '#8a8a8a',
        status,
        from,
        to,
        fromDate: entry.from,
        toDate: entry.to ?? null,
        // Lets a span be named something other than the polity, for the cases
        // where "Russia" over Crimea would read worse than "Crimea".
        label: entry.label ?? null,
        // The one-line justification for the span's dates, shown in the info
        // panel. It is the only prose the data carries, so it travels with the
        // feature rather than being looked up from the spec at runtime.
        source: entry.source ?? null,
      },
      geometry,
    });
    // Which parts this span was assembled from, parallel to `features`. Kept
    // beside them rather than on them because the overlap check needs it and
    // the map does not: it must not be shipped.
    featureParts.push(entry.partKeys);
    kept++;
  }
  console.log(`  ${spec.id}: ${kept} feature(s)`);
}

// --- the check: no ground may be claimed twice at the same instant ----------
// One test covers both mistakes. Two polities overlapping is the failure the
// parts bin exists to prevent; one polity overlapping itself is a duplicated
// span. It cannot be a comparison of dates alone, because a polity legitimately
// holds several spans at once when they carry different statuses — controlled
// ground here, disputed ground there.
//
// It is mostly answered from part ids rather than from geometry, because
// carving already guarantees the thing being checked: a part is taken out of
// its source and the source keeps the remainder, so no two distinct parts ever
// share ground. Two spans naming disjoint sets of parts therefore cannot
// overlap whatever their shapes look like, and two spans naming a part in
// common overlap on exactly that part — neither case needs an intersection.
//
// Only inline `geometry` spans, which are drawn freehand rather than carved,
// still need the real thing.
//
// Answering it this way also catches more than the geometry did: two polities
// claiming the same part are now reported even when the ground they share is
// too small to survive being simplified, which used to hide the mistake.
const byPolity = new Map();
for (const f of features) {
  const list = byPolity.get(f.properties.polity) ?? [];
  list.push(f.properties);
  byPolity.set(f.properties.polity, list);
}
const unclaimedCount = new Set(
  features.filter((f) => f.properties.kind === 'unclaimed').map((f) => f.properties.polity),
).size;

const claims = features.map((f, index) => {
  const partKeys = featureParts[index];
  const polygons = polygonsOf(f.geometry);
  return {
    // Position in `features`, which the sort below no longer preserves. The
    // contested numbering further down is keyed by it.
    index,
    props: f.properties,
    polygons,
    bbox: bboxOf(polygons),
    parts: new Set(partKeys),
    inline: partKeys.some((key) => inlineParts.has(key)),
  };
});
// Sorted by start so the sweep below can stop early rather than screening
// every pair: once a later span begins after this one has ended, so does
// every span after it. This is what keeps the check from being quadratic in
// spans, which is the shape that bites as history goes deeper.
claims.sort((a, b) => a.props.from - b.props.from);

let coexisting = 0;
let intersected = 0;
const contested = [];
/** Which other polities each feature shares its ground with, by feature index. */
const sharedWith = new Map();
const rivals = (index) => {
  if (!sharedWith.has(index)) sharedWith.set(index, new Set());
  return sharedWith.get(index);
};
for (let i = 0; i < claims.length; i++) {
  const a = claims[i];
  for (let j = i + 1; j < claims.length; j++) {
    const b = claims[j];
    // Sorted by start, so b begins at or after a — and so does everything
    // after it. Once that is past a's end, nothing later can coexist with a.
    if (b.props.from >= a.props.to) break;
    coexisting++;

    const common = [...a.parts].filter((key) => b.parts.has(key));
    // Disjoint parts, nothing drawn freehand: they cannot overlap. This is
    // the case for almost every pair, and it costs a set lookup.
    if (!common.length && !a.inline && !b.inline) continue;

    let shared;
    if (common.length) {
      // They name the same ground, so how much they share is the size of the
      // parts they share. No intersection needed to know it, or to measure it.
      shared = common.reduce((total, key) => total + areaOf(simplified.get(key) ?? []), 0);
    } else {
      // One side at least is freehand, so only the shapes can settle it.
      if (bboxesDisjoint(a.bbox, b.bbox)) continue;
      intersected++;
      shared = areaOf(polygonClipping.intersection(a.polygons, b.polygons));
    }
    if (shared <= OVERLAP_EPSILON) continue;

    const from = Math.max(a.props.from, b.props.from);
    const to = Math.min(a.props.to, b.props.to);
    const when = `${formatInstant(from)}..${to === OPEN_ENDED ? 'now' : formatInstant(to)}`;

    // Both sides saying `contested` is a deliberate shared claim, not a
    // modelling error. Two spans of one polity are still a duplicate even
    // then: a polity cannot contest itself.
    if (
      a.props.status === SHARED_STATUS &&
      b.props.status === SHARED_STATUS &&
      a.props.polity !== b.props.polity
    ) {
      rivals(a.index).add(b.props.polity);
      rivals(b.index).add(a.props.polity);
      contested.push(`${a.props.polity} and ${b.props.polity} contest ${km2(shared)} during ${when}`);
      continue;
    }

    // Unclaimed ground that someone turns out to hold is the whole point of
    // checking it: the region says nobody was here, and a polity says otherwise.
    // Exactly one side being unclaimed is the interesting case: the region says
    // nobody was here and a polity says otherwise. Both sides unclaimed is two
    // regions overlapping, which the generic message already describes.
    const empty = a.props.kind === 'unclaimed' ? a : b.props.kind === 'unclaimed' ? b : null;
    const holder = empty === a ? b : empty === b ? a : null;
    problems.push(
      a.props.polity === b.props.polity
        ? `${a.props.polity} claims ${km2(shared)} twice during ${when}` +
            ` (spans ${a.props.fromDate} and ${b.props.fromDate})`
        : empty && holder && holder.props.kind !== 'unclaimed'
          ? `${empty.props.polity} is drawn unclaimed, but ${holder.props.polity}` +
            ` holds ${km2(shared)} of it during ${when}`
          : `${a.props.polity} and ${b.props.polity} both claim ${km2(shared)} during ${when}`,
    );
  }
}
// Intersections against coexisting pairs is the number worth watching: it says
// how much of the check still costs geometry. It should stay near zero, rising
// only with the number of inline shapes.
console.log(
  `  overlap check: ${coexisting} coexisting pair(s), ${intersected} intersected`,
);
for (const note of contested) console.log(`    shared: ${note}`);

// --- who is drawn which way on shared ground -------------------------------
// A contested feature needs stripes that read through the other claimant's, so
// each is numbered within its own dispute and the style leans the stripes by
// that number. Sorting by polity id makes the numbering stable across builds
// rather than dependent on the order files happened to be read in. Two
// claimants is what reads cleanly; a third would need a device beyond lean.
const hatches = new Map();
features.forEach((f, index) => {
  if (f.properties.status !== SHARED_STATUS) return;
  const claimants = [...rivals(index), f.properties.polity].sort();
  const claim = claimants.indexOf(f.properties.polity);
  const id = `hatch-${SHARED_STATUS}-${claim}-${f.properties.color.replace('#', '')}`;
  f.properties.claim = claim;
  // The image the style reaches for with ['get', 'hatch']. Built here so the
  // id is spelled in exactly one place and the runtime only has to register
  // what this list names.
  f.properties.hatch = id;
  if (!hatches.has(id)) {
    hatches.set(id, { id, status: f.properties.status, color: f.properties.color, claim });
  }
  if (claimants.length > 2) {
    problems.push(
      `${f.properties.polity} contests ${f.properties.fromDate} with ${claimants.length - 1}` +
        ` others; only two claimants can be told apart by stripe lean`,
    );
  }
});

features.sort((a, b) => a.properties.from - b.properties.from);

// --- label anchors ---------------------------------------------------------
// Kept out of the polygon file and resolved here rather than in the browser:
// placing a name needs the pole of inaccessibility of the polity's largest
// piece, which is the one point guaranteed to be inside a concave shape.
const labels = features.flatMap((f) => {
  // Contested ground is named once. The name belongs to the place, not to
  // whichever claimant happens to be drawn first, and one label per claimant
  // would stack two identical names on the same anchor.
  if (f.properties.claim > 0) return [];
  const polygons = polygonsOf(f.geometry);
  const largest = polygons.reduce((a, b) => (areaOf([a]) >= areaOf([b]) ? a : b));
  const [lng, lat] = polylabel(largest, LABEL_PRECISION);
  const extent = Math.sqrt(areaOf(polygons));
  return [{
    polity: f.properties.polity,
    kind: f.properties.kind,
    text: f.properties.label ?? f.properties.name,
    color: f.properties.color,
    status: f.properties.status,
    from: f.properties.from,
    to: f.properties.to,
    anchor: [Number(lng.toFixed(3)), Number(lat.toFixed(3))],
    minZoom: Number(
      Math.max(0, Math.min(8, Math.log2(LABEL_ZOOM_CONSTANT / extent))).toFixed(2),
    ),
  }];
});

// --- write -----------------------------------------------------------------
// The shared topology above still keeps neighbouring borders aligned during
// simplification. At runtime, these features are served as vector tiles, so
// MapLibre only requests the geographic area currently on screen.
await mkdir(OUT_DIR, { recursive: true });
const tileResult = await writeVectorTiles(
  { type: 'FeatureCollection', features },
  join(OUT_DIR, 'polities'),
  'polities',
);
// The client no longer consumes the monolithic TopoJSON source.
await rm(join(OUT_DIR, 'polities.topojson'), { force: true });
const labelsOut = join(OUT_DIR, 'polity-labels.json');
await writeFile(labelsOut, JSON.stringify(labels));
// The stripe images the map has to generate before it can draw shared ground.
// Only the data knows which polity colours end up contesting anything, so the
// list is emitted rather than guessed at in the browser.
const hatchesOut = join(OUT_DIR, 'polity-hatches.json');
await writeFile(hatchesOut, JSON.stringify([...hatches.values()]));

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  ! ${problem}`);
}
const labelSize = (await import('node:fs/promises').then((fs) => fs.stat(labelsOut))).size;
console.log(
  `\npolity tiles · ${features.length} features · ${tileResult.tiles} tiles` +
    ` · ${(tileResult.bytes / 1024).toFixed(0)} KB` +
    ` · ${byPolity.size - unclaimedCount} polities · ${unclaimedCount} unclaimed region(s)` +
    `\npolity-labels.json · ${labels.length} labels · ${(labelSize / 1024).toFixed(1)} KB` +
    `\npolity-hatches.json · ${hatches.size} contested stripe pattern(s)`,
);
if (problems.length) process.exitCode = 1;
