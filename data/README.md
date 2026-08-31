# Data pipeline

| Command | Does |
| --- | --- |
| `npm run data:fetch` | Downloads Natural Earth into `data/sources/` (gitignored). Cached; `--force` to redownload. |
| `npm run data:basemap` | Simplifies land, lakes and rivers into `public/data/basemap.geojson`. |
| `npm run data:polities` | Builds `public/data/polities.topojson`, `polity-labels.json` and `polity-hatches.json` from `data/polities/` and `data/unclaimed/`. |
| `npm run data:build` | All three, in order. |

## Coverage

Two regions, drawn at whatever depth the sources support. Everything outside
them is simply absent, not empty:

| | |
| --- | --- |
| **North America** | 1783 to now. From the Treaty of Paris, so no colonial empire has to be drawn back to its founding. Covers the mainland, Central America, the Caribbean and Greenland. |
| **Post-Soviet Eurasia** | 1922 to now. The USSR and its successor states. |

Colombia is the one polity outside both: it is drawn only so Panama has
somewhere to come from in 1903. South America otherwise has no coverage.

The Pacific Northwest is drawn as the unclaimed Oregon Country from 1783 until
the Oregon Treaty of 1846 — claimed by four powers and then occupied jointly by
two, held by none of them throughout — so no boundary runs through it and the
49th parallel appears only on the day the treaty drew it. Hawaii before
Kamehameha unified the islands in 1795 is the one remaining blank, and is
deliberate rather than missing.

Known simplifications, all noted in the file that makes them: the Confederacy
is drawn at its eleven-state extent from the founding of the provisional
government rather than state by state as the secessions came in, and Kentucky
and Missouri are Union throughout because the Confederacy claimed them but
never held them; the Republic of Texas is drawn as the ground it held rather
than the wider claim it never controlled; Ontario's and Quebec's growth after
1870 is internal to Canada and so changes nothing here.

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
derived from the polity's extent, so Russia is named at the first zoom level and
Armenia only once you are looking at the Caucasus. `LABEL_ZOOM_CONSTANT` in
`build-polities.mjs` trades labels shown against crowding.

A span may set `label` to be named something other than its polity — useful
where "Russia" over Crimea would read worse than "Crimea".

**A label has to say who holds the ground**, and the build fails if it does
not. A renamed span is exactly where a possession stops looking like one:
"Jamaica" written across Britain's colour names the island but not its owner,
and a reader has to already know the palette to tell whose it is. Either form
works —

```json
{ "label": "British North America" }   // the way history already says it
{ "label": "Louisiana (France)" }      // or say it outright
```

— because the check accepts the polity's name, its id, or the `adjective` it
declares for its possessions:

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

## Why the output is TopoJSON

Every span is dissolved out of the same parts bin, so spans repeat each other's
outlines wholesale: Canada's Pacific coast is identical across all six of its
spans, and Britain's across all twenty-two. Written as GeoJSON, each of those
is a separate copy of the same coordinates.

TopoJSON stores each shared outline once as an *arc* and has every span that
uses it hold a reference. The 120 spans currently reduce to 703 arcs — and the
76 parts alone already account for 690 of them, so topology extraction is
rediscovering the parts bin on its own.

That is what stops the file growing as history is added. **A span that
recombines ground already drawn costs references, not coordinates.** Measured
on this data, going from 120 spans to 235 over the same parts grows the
GeoJSON by 202% and the TopoJSON by 1%; the current file is 435 KB against
2.3 MB, and 158 KB against 728 KB gzipped.

Two things this rests on, both easy to break:

- **The parts must be simplified together, as one topology, before they are
  dissolved.** That is what makes shared outlines come out bit-identical, and
  identical coordinates are exactly what arc matching keys on. Simplify per
  polity and the arcs stop matching and the file triples.
- **Quantisation is sized from `PRECISION`**, the same grid `simplifyGeometry`
  already rounds to, so it discards nothing that survived rounding. Coordinates
  come back out of the file unchanged.

MapLibre cannot read TopoJSON, so `src/lib/polities.ts` fetches and converts it
before handing it to the source with `setData` — about 20 ms, once, cached
across the style reloads a light/dark switch causes.

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
