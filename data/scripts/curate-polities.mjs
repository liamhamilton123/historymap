// data/polities/ -> data/polities/, in place. Run by hand, after the dump.
//
// import-cliopatria.mjs is mechanical: one databank Name becomes one file,
// under the databank's own name, in a colour derived from its id. This is
// where the judgement goes. Grouping the four Bulgarias into one country,
// deciding "Kingdom of Great Britain" should read as "Britain", giving
// neighbours colours that tell them apart, reading the databank's MemberOf as
// a vassalage — none of it is derivable from the source, all of it is
// revisable, and all of it happens here against files already in the
// repository rather than against a 158 MB GeoJSON.
//
// The rules are data/curation.json. This file only applies them.
//
// It is idempotent. A curated file still carries its provenance — `cliopatria`
// holds the databank record, as an array once several are merged, and a merged
// span carries the databank's name as its own — so the dump can be
// reconstructed from what is on disk and the rules applied to it afresh. Edit
// curation.json and re-run; there is no need to re-import 158 MB to change a
// colour. The exception is `drop`, which deletes the file: undoing a drop
// needs the dump back.
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, POLITIES_DIR } from './lib/config.mjs';
import { serialisePolity, slugify } from './lib/polity-file.mjs';

const CURATION_FILE = join(ROOT, 'data', 'curation.json');

/**
 * Notes live in the rules file next to what they explain, because JSON has no
 * comments and a separate document describing a rule drifts from it. Keys and
 * entries beginning with `$` are prose, and are skipped everywhere.
 */
const isNote = (key) => typeof key === 'string' && key.startsWith('$');
const entriesOf = (object) => Object.entries(object ?? {}).filter(([key]) => !isNote(key));
const listOf = (array) => (array ?? []).filter((value) => !isNote(value));

// --- the palette -----------------------------------------------------------
// Muted enough that a dozen of them on one screen still read as a map rather
// than as a chart, in the same saturation and lightness band the dump's
// generated colours used. Hue does the separating; the two saturations widen
// the space without introducing a colour that shouts.
const HUES = 18;
const SATURATIONS = [0.3, 0.42];
const LIGHTNESS = 0.47;

function hsl(hue, saturation, lightness) {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][Math.floor(hue / 60) % 6];
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const PALETTE = [];
for (const saturation of SATURATIONS) {
  for (let i = 0; i < HUES; i++) {
    const hue = (i * 360) / HUES;
    PALETTE.push({ hex: hsl(hue, saturation, LIGHTNESS), hue });
  }
}

/** Shortest way round the wheel, so 350° and 10° are 20° apart, not 340°. */
function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// --- read the dump back ----------------------------------------------------
const problems = [];
const warnings = [];

const rules = JSON.parse(await readFile(CURATION_FILE, 'utf8'));
const files = (await readdir(POLITIES_DIR)).filter((name) => name.endsWith('.json')).sort();
if (!files.length) {
  console.error(`${POLITIES_DIR} is empty — run npm run data:import-cliopatria first.`);
  process.exit(1);
}

/**
 * One bucket per databank Name, which is what the dump wrote one file per.
 * Reconstructed rather than assumed, so this runs the same on a fresh dump and
 * on its own output: a curated file names its sources in `cliopatria`, and a
 * merged span carries the databank name it came from.
 */
const dump = new Map();
for (const file of files) {
  const spec = JSON.parse(await readFile(join(POLITIES_DIR, file), 'utf8'));
  const metas = Array.isArray(spec.cliopatria) ? spec.cliopatria : [spec.cliopatria];
  if (!metas[0]?.name) {
    problems.push(`${file}: no "cliopatria" provenance — it did not come from the dump`);
    continue;
  }
  const byName = new Map(metas.map((meta) => [meta.name, meta]));
  const sole = metas.length === 1 ? metas[0].name : null;

  for (const span of spec.features ?? []) {
    const origin = span.name ?? sole;
    if (!origin || !byName.has(origin)) {
      problems.push(
        `${file}: span ${span.from} does not say which databank polity it came from` +
          ` — a merged file needs a "name" on every span`,
      );
      continue;
    }
    const id = slugify(origin);
    let bucket = dump.get(id);
    if (!bucket) {
      bucket = { id, name: origin, meta: byName.get(origin), spans: [] };
      dump.set(id, bucket);
    }
    // Curation is re-derived every run, so anything a previous run applied is
    // dropped here. Only what the dump itself writes survives.
    bucket.spans.push({ from: span.from, to: span.to, geometry: span.geometry });
  }
}

// --- resolve the rules onto the dump ---------------------------------------
const dropped = new Set(listOf(rules.drop));
for (const id of dropped) {
  if (!dump.has(id)) warnings.push(`drop: "${id}" is not in the dump`);
}

/** dump id -> the id of the file it will end up in. */
const target = new Map();
const targets = new Map();
const polityRules = entriesOf(rules.polities);

for (const [id, rule] of polityRules) {
  const members = listOf(rule.merge).length ? listOf(rule.merge) : [id];
  const present = members.filter((member) => {
    if (dropped.has(member)) return false;
    if (!dump.has(member)) {
      problems.push(`polities.${id}: "${member}" is not in the dump`);
      return false;
    }
    if (target.has(member)) {
      problems.push(`polities.${id}: "${member}" is already claimed by "${target.get(member)}"`);
      return false;
    }
    target.set(member, id);
    return true;
  });
  if (present.length) targets.set(id, { id, rule, members: present });
}

// Everything the rules said nothing about keeps its databank name and stands
// on its own. An uncurated dump is still a complete map; curation is an
// improvement to it, not a filter on it.
for (const [id, bucket] of dump) {
  if (dropped.has(id) || target.has(id)) continue;
  target.set(id, id);
  if (targets.has(id)) continue;
  targets.set(id, { id, rule: {}, members: [id] });
}

// --- assemble ---------------------------------------------------------------
const overlords = new Map(entriesOf(rules.overlords));
const groupings = new Set(listOf(rules.groupings));
const unclassified = new Map();
const cores = [];
let vassalSpans = 0;
let vassalPolities = 0;

const polities = [];
for (const { id, rule, members } of [...targets.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const merged = members.length > 1;
  const buckets = members.map((member) => dump.get(member));
  const spans = [];

  for (const bucket of buckets) {
    // MemberOf may name more than one parent, separated by semicolons.
    const parents = (bucket.meta.memberOf ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    // The databank counts an empire's core among its own members: the Bourbon
    // Kingdom of France is memberOf "(Bourbon Kingdom of France)", and the
    // Kingdom of Bohemia is memberOf its own name alongside the Empire it
    // belonged to. Read literally that makes a state its own vassal, so a
    // record naming itself as a parent is the core and takes no overlord at
    // all. It has to be checked across every parent rather than the first,
    // which is what leaves the Margraviate of Moravia — the same two parents,
    // but its own name is neither — a vassal as it should be.
    const isCore = parents.some((parent) => slugify(parent.replace(/[()]/g, '')) === bucket.id);
    if (isCore) cores.push(bucket.id);

    // The first parent declared an overlord wins; the rest are still groupings
    // or still unclassified, and neither adds anything to the span.
    let vassal = null;
    for (const parent of isCore ? [] : parents) {
      const overlord = overlords.get(parent);
      if (overlord) {
        if (!listOf(overlord.except).includes(bucket.id)) vassal = overlord.name;
        break;
      }
      if (!groupings.has(parent)) {
        if (!unclassified.has(parent)) unclassified.set(parent, []);
        unclassified.get(parent).push(bucket.id);
      }
    }
    if (vassal) vassalPolities++;

    for (const span of bucket.spans) {
      const out = { from: span.from, to: span.to };
      // A merged file covers successive entities, so each span says which one
      // it is; the build shows that name rather than flattening the People's
      // Republic into the Republic. An unmerged file has nothing to add.
      if (merged) out.name = bucket.name;
      const label = entriesOf(rule.spans).find(([from]) => from === span.from)?.[1]?.label;
      if (label) out.label = label;
      if (vassal) {
        out.relationship = 'vassal';
        out.overlord = vassal;
        vassalSpans++;
      }
      out.geometry = span.geometry;
      spans.push(out);
    }
  }

  spans.sort((a, b) => Number(a.from) - Number(b.from) || Number(a.to ?? 1e9) - Number(b.to ?? 1e9));
  for (const [from] of entriesOf(rule.spans)) {
    if (!spans.some((span) => span.from === from)) {
      warnings.push(`polities.${id}: no span begins in ${from}`);
    }
  }

  polities.push({
    id,
    name: rule.name ?? buckets[0].name,
    adjective: rule.adjective,
    color: rule.color,
    cliopatria: merged ? buckets.map((b) => b.meta) : buckets[0].meta,
    members,
    spans,
  });
}

if (problems.length) {
  console.error(`\ncuration cannot be applied:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// --- colour ----------------------------------------------------------------
// Two polities may share a colour freely as long as they are never on screen
// together. "Together" is a pair that coexists in time and whose extents are
// near each other — measured per polygon rather than per span, because one
// bounding box around a colonial empire spans the globe and would make it a
// neighbour of everything.
const pieces = [];
for (const polity of polities) {
  for (const span of polity.spans) {
    const from = Number(span.from);
    const to = span.to == null ? Infinity : Number(span.to);
    const rings =
      span.geometry.type === 'MultiPolygon'
        ? span.geometry.coordinates.map((poly) => poly[0])
        : [span.geometry.coordinates[0]];
    for (const ring of rings) {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const [x, y] of ring) {
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
      }
      pieces.push({ from, to, id: polity.id, w, s, e, n });
    }
  }
}
pieces.sort((a, b) => a.from - b.from);

const neighbours = new Map(polities.map((p) => [p.id, new Set()]));
for (let i = 0; i < pieces.length; i++) {
  const a = pieces[i];
  for (let j = i + 1; j < pieces.length; j++) {
    const b = pieces[j];
    // Sorted by start, so once one begins after this one ended, so does
    // everything after it.
    if (b.from >= a.to) break;
    if (a.id === b.id) continue;
    if (a.e < b.w || b.e < a.w || a.n < b.s || b.n < a.s) continue;
    neighbours.get(a.id).add(b.id);
    neighbours.get(b.id).add(a.id);
  }
}

const chosen = new Map();
const usage = new Map(PALETTE.map((entry) => [entry.hex, 0]));
for (const polity of polities) {
  if (!polity.color) continue;
  chosen.set(polity.id, polity.color);
  usage.set(polity.color, (usage.get(polity.color) ?? 0) + 1);
}

// Hardest first: a polity with many neighbours has the fewest colours left to
// it, and colouring it once everything around it is fixed is how a greedy pass
// paints itself into a corner.
const order = polities
  .filter((polity) => !polity.color)
  .sort((a, b) => neighbours.get(b.id).size - neighbours.get(a.id).size || a.id.localeCompare(b.id));

let collisions = 0;
for (const polity of order) {
  const taken = new Map();
  for (const other of neighbours.get(polity.id)) {
    const hex = chosen.get(other);
    if (hex) taken.set(hex, PALETTE.find((entry) => entry.hex === hex)?.hue ?? null);
  }
  // Among the colours no neighbour has taken, the one furthest round the wheel
  // from the neighbours it does have — so adjacent polities are told apart at
  // a glance rather than merely being different in the file.
  let best = null;
  for (const entry of PALETTE) {
    if (taken.has(entry.hex)) continue;
    let distance = Infinity;
    for (const hue of taken.values()) {
      if (hue != null) distance = Math.min(distance, hueDistance(entry.hue, hue));
    }
    const score = [distance === Infinity ? 180 : distance, -usage.get(entry.hex)];
    if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) {
      best = { entry, score };
    }
  }
  if (!best) {
    // Only reachable if some polity has more neighbours than the palette has
    // colours. Take the least-used and say so rather than failing the run.
    best = { entry: [...PALETTE].sort((a, b) => usage.get(a.hex) - usage.get(b.hex))[0] };
    collisions++;
  }
  chosen.set(polity.id, best.entry.hex);
  usage.set(best.entry.hex, usage.get(best.entry.hex) + 1);
}

// --- write ------------------------------------------------------------------
let bytes = 0;
const written = new Set();
for (const polity of polities) {
  const text = serialisePolity({
    name: polity.name,
    adjective: polity.adjective,
    color: chosen.get(polity.id),
    cliopatria: polity.cliopatria,
    features: polity.spans,
  });
  await writeFile(join(POLITIES_DIR, `${polity.id}.json`), text);
  written.add(`${polity.id}.json`);
  bytes += text.length;
}
let removed = 0;
for (const file of files) {
  if (written.has(file)) continue;
  await rm(join(POLITIES_DIR, file));
  removed++;
}

// --- report -----------------------------------------------------------------
// What the rules did, and what they have not been asked about yet. The second
// is the point: 1,500 files cannot be reviewed by reading them, so the run has
// to say where the judgement is still missing.
const merges = polities.filter((p) => p.members.length > 1);
console.log(
  `curated ${polities.length} polit(ies) · ${polities.reduce((n, p) => n + p.spans.length, 0)} span(s)` +
    ` · ${(bytes / 1024 / 1024).toFixed(1)} MB` +
    (removed ? ` · removed ${removed} file(s)` : ''),
);
console.log(
  `\nmerged ${merges.reduce((n, p) => n + p.members.length, 0)} dump file(s) into ${merges.length}` +
    ` · renamed ${polityRules.filter(([, r]) => r.name).length}` +
    ` · dropped ${dropped.size}` +
    `\nvassals: ${vassalPolities} polity/ies under a declared overlord, ${vassalSpans} span(s)` +
    ` · ${cores.length} core record(s) left sovereign` +
    `\ncolours: ${new Set(chosen.values()).size} of ${PALETTE.length} in use` +
    ` · ${polities.filter((p) => p.color).length} set by hand` +
    (collisions ? ` · ${collisions} could not be given a distinct colour` : ' · no neighbours share one'),
);

// A merged identity with a hole in it is usually right — the databank has no
// extent for those years — but it is also how a merge that folded two
// different states together shows itself, so every one is listed.
const gaps = [];
for (const polity of merges) {
  for (let i = 1; i < polity.spans.length; i++) {
    const end = Number(polity.spans[i - 1].to);
    const start = Number(polity.spans[i].from);
    if (start > end) gaps.push(`${polity.id}: nothing drawn ${end}–${start}`);
  }
}
if (gaps.length) console.log(`\ngaps in a merged polity:\n  ${gaps.join('\n  ')}`);

if (unclassified.size) {
  console.log(
    `\n${unclassified.size} MemberOf value(s) are neither an overlord nor a grouping — ` +
      `classify them in curation.json:\n  ` +
      [...unclassified]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([parent, ids]) => `${parent} (${ids.length}: ${ids.slice(0, 3).join(', ')}…)`)
        .join('\n  '),
  );
}

// The largest polities nobody has ruled on. Span count is the proxy for how
// much of the map an unreviewed name is responsible for.
const uncurated = polities
  .filter((p) => !p.name || !entriesOf(rules.polities).some(([id]) => id === p.id))
  .sort((a, b) => b.spans.length - a.spans.length)
  .slice(0, 10);
if (uncurated.length) {
  console.log(
    `\nbiggest polities with no rule — keeping the databank's own name:\n  ` +
      uncurated.map((p) => `${p.spans.length.toString().padStart(4)}  ${p.id}  "${p.name}"`).join('\n  '),
  );
}

if (warnings.length) console.log(`\nwarnings:\n  ${warnings.join('\n  ')}`);
console.log('\nNext: npm run data:polities');
