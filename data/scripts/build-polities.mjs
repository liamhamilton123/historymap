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
import { SOURCES_DIR, OUT_DIR, POLITIES_DIR, UNCLAIMED_DIR, NON_STATE_PEOPLES_DIR } from './lib/config.mjs';
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
/**
 * How many overlapping claims are listed before the rest are counted. A bulk
 * import can produce thousands, and a wall of them buries the build's summary.
 */
const WARNING_LIMIT = Number(process.env.WARNING_LIMIT ?? 20);
/** Stands in for `to: null` so the runtime filter is a plain numeric compare. */
const OPEN_ENDED = 9999;
/** Days elapsed before the 1st of each month; leap years ignored on purpose. */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

const SQ_DEG_TO_SQ_KM = 111 * 111;

/**
 * Sets how early a label appears: a polity shows its name once its extent is
 * roughly a fixed fraction of the viewport, so Russia is labelled from the
 * first zoom level and Armenia only once you are looking at the Caucasus.
 * Raise it to show labels later, reducing crowding.
 */
const LABEL_ZOOM_CONSTANT = 30;
/** Labels up to this many characters need no extra room. */
const LABEL_LENGTH_REFERENCE = 12;
/** Extra viewport room requested per character beyond the reference length. */
const LABEL_LENGTH_SCALE = 0.04;
/** Keep a very long name from being delayed by more than about half a zoom. */
const LABEL_LENGTH_MAX_MULTIPLIER = 1.4;
/** Precision of the label anchor search, in degrees. */
const LABEL_PRECISION = 0.05;

/**
 * Corner-cutting passes applied to an intentionally approximate outline. A
 * region is an approximation, and a polygon with hard corners and straight
 * runs between them reads as a surveyed boundary however faint it is drawn —
 * the shape itself has to say that its edge is a guess.
 * Two passes is enough to turn an authored hull into curves; more starts
 * pulling the extent in noticeably.
 */
const NON_STATE_PEOPLE_ROUNDING = 2;
/**
 * The shortest edge worth rounding, in degrees. Above it is an edge somebody
 * drew; below it is coastline out of Natural Earth, which stays as it is.
 */
const NON_STATE_PEOPLE_MIN_EDGE = 0.3;

/**
 * How a span is drawn. The styling itself lives in one place, POLITY_STATUS in
 * src/lib/mapStyle.ts — this list only exists so a typo is a build failure
 * rather than a territory that silently renders as undisputed. Keep in step.
 */
const STATUSES = ['controlled', 'disputed', 'contested'];
const DEFAULT_STATUS = 'controlled';
const RELATIONSHIPS = ['vassal', 'occupation'];
/**
 * The status that shares ground *deliberately*. Two different polities may now
 * overlap in any case — the check warns rather than fails — but two spans that
 * are both `contested` are the map saying "these polities each claim this", and
 * that declaration is what earns the shared stripes, the single label and the
 * claimant list in the panel.
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

/**
 * Chaikin's corner cutting, once around a closed ring: a corner is replaced by
 * the points a quarter and three quarters along the edges that meet there, and
 * repeating it converges on a curve.
 *
 * With one condition — a corner is only cut when both edges meeting at it are
 * longer than `minEdge`. That is what lets a rounded region keep the coastline
 * it was clipped against: an authored edge runs for degrees and rounds into an
 * arc, while a coast is a chain of segments a hair long, and every corner along
 * it is left exactly where Natural Earth put it. It also removes the need to
 * trim the result back inside the original shape, which is the operation that
 * matters: corner cutting bulges outward at concave corners, and the concave
 * corners of these shapes are their bays and lake shores. Leave those corners
 * alone and nothing can bulge into the water.
 */
function chaikinRing(ring, minEdge) {
  // A ring repeats its first point last; work on the open list and re-close.
  const open = ring.slice(0, -1);
  if (open.length < 3) return ring;
  const long = open.map(([ax, ay], i) => {
    const [bx, by] = open[(i + 1) % open.length];
    return Math.hypot(bx - ax, by - ay) >= minEdge;
  });
  const out = [];
  for (let i = 0; i < open.length; i++) {
    const a = open[i];
    const b = open[(i + 1) % open.length];
    // Cut this edge only if it and both its neighbours are long enough that
    // the corners at either end are ours to round.
    const cut = long[i] && (long[(i - 1 + open.length) % open.length] || long[(i + 1) % open.length]);
    if (!cut) {
      out.push(a);
      continue;
    }
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  out.push(out[0]);
  return out;
}

/**
 * Round a region's outline and hold the result on dry land.
 *
 * Leaving short-edge corners uncut keeps the rounding off the coastline almost
 * everywhere, but not quite: a concave corner between two long authored edges
 * still bulges outward, and if a bay sits in that notch the bulge crosses it.
 * Measured across the fifteen regions drawn today that came to about 50 km² of
 * sea under Wabanaki and 70 km² of Lake Superior under Ojibwe — small, and
 * still wrong, since a region drawn over open water is a claim about the water.
 * So the rounded shape is cut against land and against the lakes, and the
 * question stops being how much it leaks.
 */
async function roundPolygons(polygons, passes, minEdge) {
  const rounded = polygons.map((polygon) => polygon.map((ring) => {
    let out = ring;
    for (let pass = 0; pass < passes; pass++) out = chaikinRing(out, minEdge);
    return out;
  }));
  return clipPolygonsToLand(rounded);
}

/** Keep an authored extent on dry land without otherwise changing its edge. */
async function clipPolygonsToLand(polygons) {
  const { land, lakes } = await coastline();
  const bounds = bboxOf(polygons);
  // Only the coast nearby can matter, and intersecting against every landmass
  // on earth to find that out is the slow way round.
  const dry = polygonClipping.intersection(polygons, nearBounds(land, bounds));
  const near = nearBounds(lakes, bounds);
  return near.length ? polygonClipping.difference(dry, near) : dry;
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
/**
 * Two different polities on the same ground is a disagreement between sources,
 * not an authoring mistake, so it is reported and drawn rather than refused —
 * see the overlap check below. These do not fail the build.
 */
const warnings = [];
const km2 = (sqDeg) => `${(sqDeg * SQ_DEG_TO_SQ_KM).toFixed(0)} km²`;

/**
 * Whether a span's label says who holds the ground — by the polity's name, or
 * by the adjective its possessions are conventionally named with, so that
 * "British North America" counts as saying Britain without having to spell it
 * "North America (Britain)".
 */
function namesOwner(label, spec, entry) {
  const text = label.toLowerCase();
  return [entry.name, spec.name, spec.id, spec.adjective]
    .filter(Boolean)
    .some((form) => text.includes(String(form).toLowerCase()));
}

/**
 * Land and lakes, kept only to hold rounded non-state peoples on dry ground —
 * the same 1:50m layers the basemap is built from, so a region's edge and the
 * coast it stops at are the same line rather than two that nearly agree.
 * Loaded lazily: a build with no non-state peoples in it never reads them.
 */
let physical = null;
async function coastline() {
  if (physical) return physical;
  const layer = async (file) =>
    JSON.parse(await readFile(join(SOURCES_DIR, 'naturalearth', `${file}.geojson`), 'utf8'))
      .features.flatMap((f) => polygonsOf(f.geometry));
  physical = { land: await layer('ne_50m_land'), lakes: await layer('ne_50m_lakes') };
  return physical;
}

/** The polygons of `set` whose bounds come within a degree of `bounds`. */
function nearBounds(set, bounds) {
  const [w, s, e, n] = bounds;
  return set.filter((polygon) => {
    const [pw, ps, pe, pn] = bboxOf([polygon]);
    return !(pe < w - 1 || pw > e + 1 || pn < s - 1 || ps > n + 1);
  });
}

// --- the shapes -----------------------------------------------------------
// Every span draws its own geometry. There is no parts bin and no carving:
// the map's history is imported from Cliopatria, whose extents are authored
// per polity rather than cut out of a shared set of modern countries.
//
// That is a real trade and it is worth naming. Carving used to guarantee that
// two spans could not overlap and could not leave a seam between them, which
// made the overlap check a set comparison. Freehand shapes guarantee neither,
// so the check below is geometric again, and two polities sharing ground is a
// warning rather than something the data model rules out.
const shapes = new Map();

// --- specs: the filename is the id -----------------------------------------
// Two kinds of file, assembled identically. A polity holds ground; an
// unclaimed region is ground with a name and nobody holding it. They share one
// id space and one overlap check precisely because they are alternatives for
// the same slot: ground is held by one polity, or by none and then named.
const SOURCES = [
  { dir: POLITIES_DIR, kind: 'polity' },
  { dir: UNCLAIMED_DIR, kind: 'unclaimed' },
  { dir: NON_STATE_PEOPLES_DIR, kind: 'non-state-people' },
];
const specs = [];
const used = new Set();
const seenIds = new Map();
/**
 * Inline shapes waiting for a coast-aware transform. Collected rather than
 * transformed where they are found, because coastline data is loaded lazily
 * and the walk that finds them is synchronous.
 */
const coastlineTransforms = [];

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
  if (kind === 'non-state-people' && !spec.color) {
    problems.push(`${file}: a non-state people needs a colour`);
  }
  if (spec.rounded != null && typeof spec.rounded !== 'boolean') {
    problems.push(`${file}: "rounded" must be true or false`);
  }
  specs.push(spec);
  spec.entries.forEach((entry, index) => {
    if (entry.geometry) {
      // Inline shapes join the topology too, so one drawn to meet a
      // neighbour's coordinates keeps meeting it after simplification.
      const key = `${id}#${index}`;
      // Every authored shape is clipped to land here, just like the country
      // parts it can sit beside. Non-state people outlines and polities marked
      // `rounded` are also softened. The source data stays easy to author and
      // check, while the published map cannot paint an accidental sea claim.
      const shape = polygonsOf(entry.geometry);
      shapes.set(key, shape);
      const rounded = kind === 'non-state-people' || spec.rounded === true;
      coastlineTransforms.push({ key, shape, rounded });
      entry.shapeKey = key;
      used.add(key);
      return;
    }
    problems.push(
      `${file}: ${entry.from ?? `entry ${index}`} has no "geometry"` +
        (entry.parts ? ' — "parts" is gone; see data/README.md' : ''),
    );
    entry.shapeKey = null;
  });
  }
}

// Transformed here rather than inside the walk above: one read of the coastline
// serves all of them, and nothing has consumed the shapes yet.
for (const { key, shape, rounded } of coastlineTransforms) {
  shapes.set(
    key,
    rounded
      ? await roundPolygons(shape, NON_STATE_PEOPLE_ROUNDING, NON_STATE_PEOPLE_MIN_EDGE)
      : await clipPolygonsToLand(shape),
  );
}

// --- simplify every shape at once, on a shared topology --------------------
// One topology, not one per file: a border two polities were drawn to share is
// a single arc here, simplified once. Simplify them separately and the same
// border simplifies two ways, leaving a sliver down every frontier.
const objects = {};
for (const id of used) objects[id] = { type: 'MultiPolygon', coordinates: shapes.get(id) };
const topo = simplify(presimplify(topology(objects)), SIMPLIFY_WEIGHT);
const simplified = new Map();
for (const id of used) simplified.set(id, polygonsOf(topoFeature(topo, topo.objects[id]).geometry));
const countVertices = (map) =>
  [...map.values()].reduce((n, polys) => n + polys.reduce((m, p) => m + p.reduce((k, r) => k + r.length, 0), 0), 0);
const before = countVertices(new Map([...used].map((id) => [id, shapes.get(id)])));
console.log(
  `\n  simplified ${used.size} part(s) as one topology:` +
    ` ${before} -> ${countVertices(simplified)} vertices`,
);

// --- assemble the features -------------------------------------------------
const features = [];
for (const spec of specs) {
  let kept = 0;
  for (const entry of spec.entries) {
    const polygons = entry.shapeKey ? simplified.get(entry.shapeKey) ?? [] : [];
    if (!polygons.length) continue;

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
    const hitSlop = entry.hitSlop ?? spec.hitSlop ?? 0;
    if (!Number.isFinite(hitSlop) || hitSlop < 0) {
      problems.push(`${spec.file}: ${entry.from} has an invalid hitSlop`);
    }

    // An unclaimed region has no owner, so it has neither a colour — colour on
    // this map means identity — nor a status, which only says how an owner
    // holds something. Saying otherwise in the file is a mistake worth naming.
    const unclaimed = spec.kind === 'unclaimed';
    const nonStatePeople = spec.kind === 'non-state-people';
    const relationship = entry.relationship ?? spec.relationship ?? null;
    const overlord = relationship ? entry.overlord ?? spec.overlord ?? spec.name ?? spec.id : null;
    let status = entry.status ?? spec.status ?? DEFAULT_STATUS;
    if (unclaimed || nonStatePeople) {
      if (entry.status ?? spec.status) {
        problems.push(`${spec.file}: ${unclaimed ? 'unclaimed ground' : 'a non-state people'} cannot have a status`);
      }
      status = null;
    } else if (!STATUSES.includes(status)) {
      problems.push(`${spec.file}: ${entry.from} has unknown status "${status}"`);
    }
    if (relationship && !RELATIONSHIPS.includes(relationship)) {
      problems.push(`${spec.file}: ${entry.from} has unknown relationship "${relationship}"`);
    }
    if ((unclaimed || nonStatePeople) && relationship) {
      problems.push(`${spec.file}: ${unclaimed ? 'unclaimed ground' : 'a non-state people'} cannot have a relationship`);
    }

    // A label replaces the polity's name on the map, which is exactly where a
    // possession stops looking like a possession: "Jamaica" in Britain's colour
    // does not say whose it is. So a renamed span has to name its owner, either
    // the way history already does it — "British North America", "New Spain" —
    // or by saying so outright, "Louisiana (France)". Unclaimed ground is
    // exempt: it has no owner to name.
    if (!unclaimed && !nonStatePeople && entry.label && !namesOwner(entry.label, spec, entry)) {
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
        // A long-lived container can represent successive entities. A span
        // name lets the map and info panel show the historical entity rather
        // than flattening, for example, Castile into the later Spanish Empire.
        name: entry.name ?? spec.name ?? spec.id,
        color: unclaimed ? null : spec.color ?? '#8a8a8a',
        status,
        relationship,
        overlord,
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
        // Extra screen pixels around a very small polity that count as a
        // click. It affects picking only; its visible boundary stays exact.
        hitSlop,
      },
      geometry,
    });
    kept++;
  }
  console.log(`  ${spec.id}: ${kept} feature(s)`);
}

// --- the check: who shares ground at the same instant -----------------------
// One sweep finds every pair, and what it does with a pair depends on who the
// two are. A polity overlapping *itself* is a duplicated span, and unclaimed
// ground someone turns out to hold contradicts the claim the region makes, so
// both fail the build. Two different polities on the same ground is a
// disagreement between sources — the world does produce it, and nothing here
// can tell it from a mistake — so it is warned about and drawn.
//
// It cannot be a comparison of dates alone, because a polity legitimately
// holds several spans at once when they carry different statuses — controlled
// ground here, disputed ground there.
//
// It is answered from geometry. It used to be answered from part ids, which
// was far cheaper — carving guaranteed that two spans naming disjoint parts
// could not overlap — but nothing is carved any more, so the shapes are all
// there is to compare. Two screens keep that affordable: the sweep is sorted
// by start date and breaks as soon as a span begins after the current one
// ended, and coexisting pairs are then screened by bounding box. Only what
// survives both is intersected.
const byPolity = new Map();
for (const f of features) {
  const list = byPolity.get(f.properties.polity) ?? [];
  list.push(f.properties);
  byPolity.set(f.properties.polity, list);
}
const countOfKind = (kind) =>
  new Set(features.filter((f) => f.properties.kind === kind).map((f) => f.properties.polity)).size;
const unclaimedCount = countOfKind('unclaimed');
const nonStatePeopleCount = countOfKind('non-state-people');

const claims = features.map((f, index) => {
  const polygons = polygonsOf(f.geometry);
  return {
    // Position in `features`, which the sort below no longer preserves. The
    // contested numbering further down is keyed by it.
    index,
    props: f.properties,
    polygons,
    bbox: bboxOf(polygons),
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

    // A non-state people is an associated extent, not an exclusive claim. Its
    // overlap with a polity (or another non-state people) is expected.
    if (a.props.kind === 'non-state-people' || b.props.kind === 'non-state-people') continue;

    // Every shape is freehand now, so only the shapes themselves can settle
    // it. The bounding boxes screen out the overwhelming majority first —
    // most pairs that coexist in time are nowhere near each other in space —
    // and only what survives that costs an intersection.
    if (bboxesDisjoint(a.bbox, b.bbox)) continue;
    intersected++;
    const shared = areaOf(polygonClipping.intersection(a.polygons, b.polygons));
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
    // Exactly one side being unclaimed is the interesting case. Both sides
    // unclaimed is two regions overlapping, which the generic message describes.
    const empty = a.props.kind === 'unclaimed' ? a : b.props.kind === 'unclaimed' ? b : null;
    const holder = empty === a ? b : empty === b ? a : null;

    // One polity on its own ground twice is a duplicated span — it says nothing
    // about the world, so it stays a build failure.
    if (a.props.polity === b.props.polity) {
      problems.push(
        `${a.props.polity} claims ${km2(shared)} twice during ${when}` +
          ` (spans ${a.props.fromDate} and ${b.props.fromDate})`,
      );
      continue;
    }
    // Unclaimed ground is a positive statement that nobody held this, so a
    // holder on it is a contradiction within the map's own data, not two
    // sources disagreeing. Both sides unclaimed is the same contradiction
    // twice over: two regions cannot each be the name of one piece of ground.
    if (empty) {
      problems.push(
        holder && holder.props.kind !== 'unclaimed'
          ? `${empty.props.polity} is drawn unclaimed, but ${holder.props.polity}` +
            ` holds ${km2(shared)} of it during ${when}`
          : `${a.props.polity} and ${b.props.polity} are both drawn unclaimed over` +
            ` ${km2(shared)} during ${when}`,
      );
      continue;
    }
    // Two polities on the same ground. Nothing here can tell a mistake from a
    // genuine dual claim, so it is reported and drawn: the fills stack, and a
    // click takes whichever is on top.
    warnings.push(
      `${a.props.polity} and ${b.props.polity} both claim ${km2(shared)} during ${when}`,
    );
  }
}
// Intersections against coexisting pairs is the number worth watching: it says
// how much of the check still costs geometry. It should stay near zero, rising
// only with the number of inline shapes.
console.log(
  `  overlap check: ${coexisting} coexisting pair(s), ${intersected} intersected` +
    `, ${warnings.length} overlapping claim(s)`,
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
function labelLengthMultiplier(text) {
  const extraCharacters = Math.max(0, [...text].length - LABEL_LENGTH_REFERENCE);
  return Math.min(LABEL_LENGTH_MAX_MULTIPLIER, 1 + extraCharacters * LABEL_LENGTH_SCALE);
}

const labels = features.flatMap((f) => {
  // Contested ground is named once. The name belongs to the place, not to
  // whichever claimant happens to be drawn first, and one label per claimant
  // would stack two identical names on the same anchor.
  if (f.properties.claim > 0) return [];
  const polygons = polygonsOf(f.geometry);
  const largest = polygons.reduce((a, b) => (areaOf([a]) >= areaOf([b]) ? a : b));
  const [lng, lat] = polylabel(largest, LABEL_PRECISION);
  const extent = Math.sqrt(areaOf(polygons));
  const text = f.properties.label ?? f.properties.name;
  return [{
    polity: f.properties.polity,
    kind: f.properties.kind,
    text,
    color: f.properties.color,
    status: f.properties.status,
    from: f.properties.from,
    to: f.properties.to,
    anchor: [Number(lng.toFixed(3)), Number(lat.toFixed(3))],
    minZoom: Number(
      Math.max(0, Math.min(8, Math.log2(
        (LABEL_ZOOM_CONSTANT * labelLengthMultiplier(text)) / extent,
      ))).toFixed(2),
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

if (warnings.length) {
  console.log(`\n${warnings.length} overlapping claim(s):`);
  for (const warning of warnings.slice(0, WARNING_LIMIT)) console.log(`  ~ ${warning}`);
  if (warnings.length > WARNING_LIMIT) {
    console.log(`  ~ ... and ${warnings.length - WARNING_LIMIT} more`);
  }
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  ! ${problem}`);
}
const labelSize = (await import('node:fs/promises').then((fs) => fs.stat(labelsOut))).size;
console.log(
  `\npolity tiles · ${features.length} features · ${tileResult.tiles} tiles` +
    ` · ${(tileResult.bytes / 1024).toFixed(0)} KB` +
    ` · ${byPolity.size - unclaimedCount - nonStatePeopleCount} polities` +
    ` · ${unclaimedCount} unclaimed region(s) · ${nonStatePeopleCount} non-state people(s)` +
    `\npolity-labels.json · ${labels.length} labels · ${(labelSize / 1024).toFixed(1)} KB` +
    `\npolity-hatches.json · ${hatches.size} contested stripe pattern(s)`,
);
if (problems.length) process.exitCode = 1;
