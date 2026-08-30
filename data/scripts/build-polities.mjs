// One file per polity -> one flat FeatureCollection of "this shape, this
// polity, this span of time". Every feature is independent; nothing is joined
// at runtime. The map draws it with a single filter on the current instant.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import polygonClipping from 'polygon-clipping';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { feature as topoFeature } from 'topojson-client';
import { SOURCES_DIR, OUT_DIR, POLITIES_DIR, PARTS_FILE, NATURAL_EARTH_PARTS } from './lib/config.mjs';
import { simplifyGeometry } from './lib/geo.mjs';

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
 * How a span is drawn. The styling itself lives in one place, POLITY_STATUS in
 * src/lib/mapStyle.ts — this list only exists so a typo is a build failure
 * rather than a territory that silently renders as undisputed. Keep in step.
 */
const STATUSES = ['controlled', 'disputed'];
const DEFAULT_STATUS = 'controlled';

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

// --- polity specs: the filename is the id ----------------------------------
const specFiles = (await readdir(POLITIES_DIR)).filter((name) => name.endsWith('.json')).sort();
const specs = [];
const used = new Set();

for (const file of specFiles) {
  const id = basename(file, '.json');
  const spec = JSON.parse(await readFile(join(POLITIES_DIR, file), 'utf8'));
  spec.id = id;
  spec.file = file;
  spec.entries = spec.features ?? [];
  specs.push(spec);
  spec.entries.forEach((entry, index) => {
    if (entry.geometry) {
      // Inline shapes join the topology too, so one drawn to meet a
      // neighbour's coordinates keeps meeting it after simplification.
      const key = `${id}#${index}`;
      parts.set(key, polygonsOf(entry.geometry));
      entry.partKeys = [key];
      used.add(key);
      return;
    }
    entry.partKeys = entry.parts ?? [];
    for (const code of entry.partKeys) {
      if (!parts.has(code)) problems.push(`${file}: no part "${code}"`);
      else used.add(code);
    }
  });
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
      { tolerance: 0, minArea: spec.minArea ?? MIN_AREA },
    );
    if (!geometry) {
      problems.push(`${spec.file}: ${entry.from} has nothing left after dropping specks`);
      continue;
    }

    const from = toInstant(entry.from);
    const to = toInstant(entry.to);
    if (!(to > from)) problems.push(`${spec.file}: ${entry.from} ends (${entry.to}) before it starts`);

    const status = entry.status ?? spec.status ?? DEFAULT_STATUS;
    if (!STATUSES.includes(status)) {
      problems.push(`${spec.file}: ${entry.from} has unknown status "${status}"`);
    }

    features.push({
      type: 'Feature',
      properties: {
        polity: spec.id,
        name: spec.name ?? spec.id,
        color: spec.color ?? '#8a8a8a',
        status,
        from,
        to,
        fromDate: entry.from,
        toDate: entry.to ?? null,
      },
      geometry,
    });
    kept++;
  }
  console.log(`  ${spec.id}: ${kept} feature(s)`);
}

// --- the check: no ground may be claimed twice at the same instant ----------
// One test covers both mistakes. Two polities overlapping is the failure the
// parts bin exists to prevent; one polity overlapping itself is a duplicated
// span. It has to be geometric rather than a comparison of dates, because a
// polity legitimately holds several spans at once when they carry different
// statuses — controlled ground here, disputed ground there.
const byPolity = new Map();
for (const f of features) {
  const list = byPolity.get(f.properties.polity) ?? [];
  list.push(f.properties);
  byPolity.set(f.properties.polity, list);
}

const claims = features.map((f) => {
  const polygons = polygonsOf(f.geometry);
  return { props: f.properties, polygons, bbox: bboxOf(polygons) };
});
let compared = 0;
for (let i = 0; i < claims.length; i++) {
  for (let j = i + 1; j < claims.length; j++) {
    const a = claims[i];
    const b = claims[j];
    const from = Math.max(a.props.from, b.props.from);
    const to = Math.min(a.props.to, b.props.to);
    if (!(to > from) || bboxesDisjoint(a.bbox, b.bbox)) continue;
    compared++;
    const shared = areaOf(polygonClipping.intersection(a.polygons, b.polygons));
    if (shared <= OVERLAP_EPSILON) continue;
    const when = `${formatInstant(from)}..${to === OPEN_ENDED ? 'now' : formatInstant(to)}`;
    problems.push(
      a.props.polity === b.props.polity
        ? `${a.props.polity} claims ${km2(shared)} twice during ${when}` +
            ` (spans ${a.props.fromDate} and ${b.props.fromDate})`
        : `${a.props.polity} and ${b.props.polity} both claim ${km2(shared)} during ${when}`,
    );
  }
}
console.log(`  overlap check: ${compared} coexisting pair(s) intersected`);

features.sort((a, b) => a.properties.from - b.properties.from);

await mkdir(OUT_DIR, { recursive: true });
const out = join(OUT_DIR, 'polities.geojson');
await writeFile(out, JSON.stringify({ type: 'FeatureCollection', features }));
const { size } = await import('node:fs/promises').then((fs) => fs.stat(out));

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  ! ${problem}`);
}
console.log(
  `\npolities.geojson · ${features.length} features · ${(size / 1024).toFixed(0)} KB` +
    ` · ${byPolity.size} polities`,
);
if (problems.length) process.exitCode = 1;
