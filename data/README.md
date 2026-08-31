# Data pipeline

| Command | Does |
| --- | --- |
| `npm run data:fetch` | Downloads Natural Earth into `data/sources/` (gitignored). Cached; `--force` to redownload. |
| `npm run data:basemap` | Simplifies land, lakes and rivers into `public/data/basemap/` vector tiles. |
| `npm run data:polities` | Builds vector tiles, labels, and hatches from the historical data directories. |
| `npm run data:build` | All three, in order. |

## Coverage

Three regions, drawn at whatever depth the sources support. Everything outside
them is simply absent, not empty:

| | |
| --- | --- |
| **North America** | 7000 BCE to now. The mainland, Central America, the Caribbean and Greenland: Indigenous peoples and polities, the colonial empires as they grew, and the states that followed them. |
| **South America** | 5000 BCE to now. The Andean empires, then the colonial viceroyalties and Guianas, then the modern republics. |
| **Post-Soviet Eurasia** | 1922 to now. The USSR and its successor states. |

Ground no polity is drawn on is blank rather than filled with a
continent-sized approximation, and blank is a claim in itself: it says no
evidence-backed shape exists here yet, not that nothing was here. Ground that
several powers claimed and none held is an unclaimed region with a name, not a
border drawn down the middle of it.

The Indigenous nations of the Americas are drawn in two layers, because they
are two different facts. One with a government speaking for the ground is a
polity, for the years this map can hold it — a colonial claim drawn on the same
ground ends the span, since the two cannot share it. Everything else is a
non-state people: a confederacy of self-governing towns, a people whose bands
governed themselves, or a country held in fact under someone else's claim.
Which of the two an entry is, and why its span ends where it does, belongs in
that entry's `source`.

## Historical research policy

When adding or correcting polity names, dates, relationships, or boundaries,
use [Cliopatria / Seshat Global History Databank](https://github.com/Seshat-Global-History-Databank/cliopatria)
as a primary chronological reference. Its public GeoJSON release is the
canonical place to inspect its `Name`, `FromYear`, `ToYear`, `Components`, and
`MemberOf` fields.

**Do not import Cliopatria geometry or copy its full dataset into this
repository.** Keep the map's geometry authored from its own parts and inline
shapes, and use Cliopatria to research and verify those entries. The global
attribution in the information panel and the Source section below are the only
required citation; do not add per-polity Cliopatria citations unless a user
specifically asks for them.

### Growth in steps

Colonies and empires grow in steps rather than appearing at full extent. Each
step is a span keyed to a Cliopatria slice — the year its area changes — and
the shape is authored to match the area recorded for that slice inside the
region drawn. Drawn shapes are cut against the same Natural Earth coastline the
basemap is built from, so a colony's seaward edge is the real coast and its
bays are water; only the inland frontier is authored. River-valley colonies are
the exception and are left uncut, so the river stays inside them.

Everything particular to one entry — which year each step is, what it is drawn
to, why a span starts late or stops early, and any simplification it makes —
goes in that span's `source`, and the reasons a part exists go in its `why`.
None of it belongs here: this file describes the rules, and there is no version
of it that stays true while the data grows.

Where Cliopatria lets two claims overlap and this map cannot, the span says
which extent was drawn and what was given up to draw it.

## Polities

One file per polity, named by its id: `data/polities/ukraine.json`. Each file
gives the polity a name and a colour, and lists the spans of time it existed
for. A span's shape is assembled from named `parts`.

```json
{
  "name": "Ukraine",
  "color": "#c8a24a",
  "features": [
    { "from": "1991-12-26", "to": "2014-03-18", "parts": ["UKR", "crimea"] },
    { "from": "2014-03-18", "to": null, "parts": ["UKR"] }
  ]
}
```

A span may carry a `status`, defaulting to `controlled`:

```json
{ "from": "2014-03-18", "to": null, "parts": ["crimea"], "status": "disputed" }
```

`controlled` is ground held and not seriously contested. `disputed` is ground
held in fact but whose claim is rejected — occupation, annexation, unrecognised
secession — drawn with diagonal stripes over its fill and a dashed outline.

`contested` is the third case: ground **more than one polity claims at once**,
with no one of them holding it. Where `disputed` has one holder, this has none,
so it is the one status the overlap check lets share ground — the same shape is
written once per claimant, in each polity's own file:

```json
// in two polity files at once, for ground they both claim
{ "from": "...", "to": "...", "parts": ["..."], "status": "contested" }
```

Nothing currently uses it. Where two states each claim ground and neither holds
it, the better answer is usually an unclaimed region — see below — which names
the place rather than making it the joint property of its claimants.

Contested spans get no fill, because two translucent fills stacked would blend
into a third colour belonging to neither claimant. Each claimant reads as
stripes in its own colour instead, and the build numbers the claimants within
each dispute so the style can lean their stripes opposite ways and both show
through. Two claimants is what reads; a third is a build error, because lean
alone cannot separate them. Ground contested this way is named once, not once
per claimant, and clicking it names every claimant on it.

The stripe colours are the reason for a third output file. `fill-pattern`
cannot be tinted per feature, so a coloured hatch needs one generated image per
colour, and only the data knows which colours end up contesting anything —
hence `polity-hatches.json`, which is the list the map registers before it can
draw shared ground. With nothing contested it is written as an empty list.

## Unclaimed ground

Not every piece of ground has an owner, and a map that can only draw owners has
to leave the rest blank — which reads as missing data rather than as a fact.
So there is a second kind of file, in `data/unclaimed/`, named by its id the
same way. It is a polity file with everything that implies an owner taken out:

```json
{
  "name": "Oregon Country",
  "features": [
    { "from": "1818-10-20", "to": "1846-06-15",
      "parts": ["oregon-country", "oregon-country-north"],
      "source": "Occupied jointly by Britain and the United States ..." }
  ]
}
```

No `color`, because colour on this map means identity and there is none here.
No `status`, because a status says how an owner holds something. Saying either
is a build error rather than something quietly ignored. What it keeps is a
name, spans, geometry assembled from the same parts bin, and a `source` note —
so the ground can be labelled and can answer a click.

Polities and unclaimed regions **share one id space and one overlap check**,
because they are alternatives filling the same slot: a piece of ground is held
by one polity, or by none and then named. That makes the check do double duty —
ground drawn as unclaimed that some polity turns out to hold is reported as
exactly that, which is how the Oregon Country's dates stay honest against the
Oregon Treaty.


Features carry a `kind` of `polity` or `unclaimed` to keep the two apart in the
style: unclaimed ground is drawn in the theme's neutral with a dotted outline
rather than in an owner's colour, and named in italic rather than upright
capitals — the old atlas convention, upright for what a state administers and
italic for what is merely a place.

**All of that styling lives in one place**, `POLITY_STATUS` in
`src/lib/mapStyle.ts`. Adding a status there gives it a fill opacity, an
optional stripe pattern, an outline layer and a line style automatically;
nothing is styled per feature, so every disputed territory on the map matches by
construction. The stripe tile is generated from the same entry by
`src/lib/hatch.ts` rather than shipped as an image, so its spacing, weight and
colour stay described alongside everything else. `STATUSES` in
`build-polities.mjs` mirrors the keys so a typo fails the build instead of
quietly rendering as undisputed.

A polity can hold controlled and disputed ground at the same time — that is
simply two spans running concurrently, which is why the overlap check is
geometric rather than a comparison of dates. It is also why `contested` had to
be a status rather than a flag on the check: the build has to be able to tell
"these two both claim this on purpose" from "one of these is wrong", and the
spans themselves are the only place that intent is written down.

`from` and `to` are ISO dates — `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, negative for
BC. `to: null` means "still current". Dates are exclusive at the end, so one
span ending on the day the next begins leaves no gap.

## Non-state peoples

`data/non-state-peoples/` is for a broad **Non-state people**: an approximate
area associated with a people, not a state territory. These may
overlap polities and one another, which is why nothing of one is drawn until it
is selected: a dozen overlapping washes read as noise, and faint enough to fix
that they said nothing. At rest a people is its italic label. Selected, it gets
its outline and a near-solid fill, drawn above the polities so its colour is its
own.

```json
{
  "name": "Example people",
  "color": "#8f6e4a",
  "features": [
    { "from": "-1000", "to": "500", "geometry": { "type": "Polygon", "coordinates": [] },
      "source": "Brief citation or evidence note." }
  ]
}
```

The approximate shape is intentional and the build makes it look so: a people's
outline is rounded by `NON_STATE_PEOPLE_ROUNDING` passes of corner cutting in
`build-polities.mjs`, so an authored hull arrives as curves rather than as a
surveyed boundary. Author the plain hull and let the build soften it. Only
corners whose edges are longer than `NON_STATE_PEOPLE_MIN_EDGE` are cut, which
leaves a clipped coastline where Natural Earth put it, and the rounded shape is
then cut against land and lakes — corner cutting bulges outward at concave
corners, and a bay is a concave corner.

Polities keep their authored borders by default: a border a treaty fixed is not
ours to soften. A polity whose extent is deliberately approximate can opt into
the identical treatment with a top-level `"rounded": true` prop:

```json
{
  "name": "Example polity",
  "rounded": true,
  "features": []
}
```

Use it only for an imprecise or reconstructed extent, never to soften a
surveyed, treaty-defined, or hand-off-matched boundary.

Do not give these entries a `status`: `controlled`, `disputed` and `contested`
describe political possession. They are also the one kind the overlap check
skips, on both sides, so a people may sit inside a state that claimed the same
ground.

That exemption is the only discipline the layer has, so two rules keep it from
becoming a way to draw whatever the polity layer refuses. A region is the extent
of a people, never a claim or a military reach dressed up as one — conquests
belong in the polity layer or nowhere. And its span is dated at both ends to
something that happened: a treaty, a removal, a dissolution.

Non-state peoples are named for the people alone, in the form a reader is most likely to
know — `Navajo`, not "Navajo country" and not "Diné Bikéyah" — with the
people's own name in the `source`. Ids share one space with polities, so a
people and a polity for the same people need distinct file names; the build
fails on a duplicate. Keep to homelands that can be dated and sourced: the
continent-wide culture areas of the standard schemes are deliberately not
drawn, since a handful of shapes covering everything would fill in exactly the
blanks this map keeps on purpose.

## Vassals

A dependent polity or colonial possession may carry `"relationship": "vassal"`.
When a span belongs to a parent polity's file, the parent is inferred; set
`overlord` only when it should name a different parent. This preserves the
existing territory and colour while the panel makes the dependency explicit.

```json
{ "label": "Jamaica (Britain)", "relationship": "vassal" }
```

An existing span may instead carry `"relationship": "occupation"`. This
does not change its geometry; it records that the named parent held the area
by occupation, and the panel says “Occupied by …”.

## Parts

A part is either a Natural Earth country code (`ADM0_A3`, e.g. `UKR`) or an id
from `data/parts.json`. That file carves pieces out of the countries, for land
that changed hands inside the period:

```json
"crimea": { "source": "RUS", "within": [32.0, 44.0, 37.0, 46.5] },
"donbas": { "source": "UKR", "clip": { "type": "Polygon", "coordinates": [...] } }
```

`within` takes whole polygons that fall inside `[west, south, east, north]` —
cheap, and exact when the piece already stands alone as an island or peninsula.
`clip` cuts against a drawn shape, for anything interior to a landmass.

Carving is the only idea here: **the part is taken out of its source, and the
source keeps the remainder.** So after the `crimea` entry above, `RUS` means
"Russia without Crimea", and Ukraine spells itself `["UKR", "crimea"]` before
2014 and `["UKR"]` after. Nothing is ever in two parts at once, so polities
assembled from parts can neither overlap nor leave a gap.

A rough `clip` shape is fine: the cut is exact regardless, because the part
keeps the source's own coastline everywhere except along the cut, and the
remainder is given the identical cut. Only the interior line is yours to draw.

Anything the parts bin cannot express can be given as an inline `geometry` on a
span instead. Inline shapes join the same topology, so one drawn to meet a
neighbour's coordinates keeps meeting it.

## Labels

The build also writes `public/data/polity-labels.json`: one anchor per span, at
the pole of inaccessibility of the polity's largest piece, which is the one
point guaranteed to fall inside a concave shape. Each carries a `minZoom`
derived from the polity's extent and its label length, so Russia is named at the
first zoom level and Armenia only once you are looking at the Caucasus. Long
names wait for a little more room. `LABEL_ZOOM_CONSTANT` in
`build-polities.mjs` trades labels shown against crowding.

A span may set `label` to be named something other than its polity — useful
where "Russia" over Crimea would read worse than "Crimea". A span may also set
`name` when one authored file covers successive historical entities, such as
the Crown of Castile followed by the Spanish Empire; that name is used in the
map feature and information panel for just that span.

**A label has to say who holds the ground**, and the build fails if it does
not. A renamed span is exactly where a possession stops looking like one:
"Jamaica" written across Britain's colour names the island but not its owner,
and a reader has to already know the palette to tell whose it is. Either form
works —

```json
{ "label": "British North America" }   // the way history already says it
{ "label": "Louisiana (France)" }      // or say it outright
```

- because the check accepts the span's name, the polity's name or id, or the
`adjective` it declares for its possessions:

```json
{ "name": "Britain", "adjective": "British", "features": [ ... ] }
```

which is what lets "New Spain", "Danish West Indies" and "U.S. Virgin Islands"
stand as written. Unclaimed regions are exempt: they have no owner to name, and
their name is the entity's own.

## Simplification

Every part is simplified once, together, as a shared topology — a border
between two neighbours is one arc, simplified one way. This is why the
tolerance (`SIMPLIFY_WEIGHT` in `build-polities.mjs`) is global rather than
per polity: give two neighbours their own tolerances and their shared border
simplifies two ways, leaving a sliver along every frontier. Per-polity
`minArea` is safe and is supported as a field on a polity file.

## Why the output is vector tiles

The basemap and historical spans are generated as static Mapbox vector tiles
under `public/data/{basemap,polities}/{z}/{x}/{y}.pbf`. MapLibre loads only the
tiles in the viewport, so startup no longer fetches a worldwide GeoJSON file or
converts a whole historical topology on the main thread.

The underlying parts are still simplified together as one topology before
spans are assembled. That keeps neighbouring borders identical and prevents
seams; the final tile step clips and simplifies that shared geometry for each
zoom level. The pyramid is generated through zoom 6, after which MapLibre
overscales the highest-detail tiles for the map's constrained close views.

## Checks

The build exits non-zero on any of:

- a part id that does not exist, or a carve that selects nothing
- a span that ends before it starts, or one using an unknown `status`
- **the same ground claimed twice at one instant** — by two polities, which is
  the failure the parts bin exists to prevent, or by one polity, which means a
  duplicated span
- geometry that disappears entirely once specks are dropped

That last check is answered from part ids, not from geometry. Carving already
guarantees what it is testing: no two distinct parts share ground, so two spans
naming disjoint sets of parts **cannot** overlap, and two spans naming a part in
common overlap on exactly that part. Neither case needs an intersection. Only
inline `geometry` spans, drawn freehand rather than carved, still need one.

Spans are swept in date order and the sweep stops as soon as a span starts after
the current one ended, so pairs that never coexist are never examined. Together
that is what keeps the check from being quadratic in spans, which is the shape
that bites as history goes deeper — measured on this data, 120 spans to 1,080
takes the whole build from 0.72 s to 0.98 s, where the old geometric check
alone took 32 s at 240.

It also catches *more* than the geometric version did: two polities claiming the
same part are now reported even when the ground they share is too small to
survive simplification, which used to hide the mistake entirely.

The build prints `overlap check: N coexisting pair(s), M intersected`. **M is
the number to watch** — it is how much of the check still costs geometry, and it
should stay near zero, rising only with the number of inline shapes.

## Source

[Natural Earth](https://www.naturalearthdata.com/) via `nvkelso/natural-earth-vector`,
1:50m physical layers. Public domain — anything derived from it is unencumbered.

Each feature is tagged with a `kind` (`land`, `lake`, `river`) so the map style
can drive all three from one source.

[Cliopatria / Seshat Global History Databank](https://github.com/Seshat-Global-History-Databank/cliopatria)
is used as a historical reference when researching and checking the authored
polity data; its geometries are not imported into this map.
