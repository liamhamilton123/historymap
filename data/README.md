# Data pipeline

| Command | Does |
| --- | --- |
| `npm run data:fetch` | Downloads Natural Earth into `data/sources/` (gitignored). Cached; `--force` to redownload. |
| `npm run data:basemap` | Simplifies land, lakes and rivers into `public/data/basemap/` vector tiles. |
| `npm run data:polities` | Builds vector tiles, labels, hatches, and `unmapped.json` from the historical data directories. |
| `npm run data:build` | All three, in order. |

## Coverage

Three regions, drawn at whatever depth the sources support. Everything outside
them is simply absent, not empty:

| | |
| --- | --- |
| **North America** | 1400 to now. The mainland, Central America, the Caribbean and Greenland: Indigenous polities, the colonial empires as they grew, and the states that followed them. |
| **South America** | 1400 to now. The Andean empires, then the colonial viceroyalties and Guianas, then the modern republics. |
| **Post-Soviet Eurasia** | 1922 to now. The USSR and its successor states. |

The Pacific Northwest is drawn as the unclaimed Oregon Country from the Nootka
convention of 1790 until the Oregon Treaty of 1846 — claimed by four powers and then occupied jointly by
two, held by none of them throughout — so no boundary runs through it and the
49th parallel appears only on the day the treaty drew it. Ground no polity is drawn on
is blank rather than filled with a continent-sized approximation: the many
Indigenous nations of the Americas are drawn in two layers, because they are
two different facts.

Those that had a government speaking for the ground are polities: the Triple
Alliance, the Inca, the Chimú, the Maya, the Haudenosaunee, the
Huron-Wendat Confederacy, the Powhatan paramount chiefdom, the Muscogee
(Creek) Confederacy, the
Cherokee under the treaty of 1730, and the Pueblo Revolt. Each is drawn only
for the years this map can hold it, because a colonial claim is drawn on the
same ground from a known date and the two cannot share it: the Wendat to the
dispersal of 1650; the Powhatan to 1609, where the Virginia colony begins,
rather than to the chiefdom's own end in 1646; the Cherokee and the Muscogee to
the Treaty of Paris in 1783, which hands their country to the United States
here, rather than to removal in the 1830s. Every one of those cut-offs is
written into the span's own `source`.

Everything else is a cultural region, and that is not a lesser answer — it is
the accurate one twice over. Most of these nations were confederacies of
self-governing towns or autonomous bands rather than states: the pueblos were
twenty towns speaking six languages, the Apache and the Anishinaabe governed
themselves band by band, and drawing any of them as one polity would invent a
government that did not exist. And the ones that did hold their ground in fact
mostly held it *under someone else's claim* — Comanche, Apache, Sioux and
Blackfoot country all lie inside Spanish, Mexican, British or United States
territory as this map draws it, for the whole of their lives.
The polity layer cannot say that, because it lets exactly one holder onto a
piece of ground. The cultural region layer can, and the gap it opens between
the claim and the control is the point of it: the United States buys the
northern plains in 1803 and does not hold them until the 1870s. Three blanks are deliberate in the same way: Hawaii before Kamehameha
unified the islands in 1795, the Falkland Islands before France founded Port
Louis in 1764, and the country west of the Rockies between 1783 and the
Hudson's Bay Company licence of 1821.

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

### Colonial growth in the Americas

The mainland colonies grow in steps rather than appearing at full extent. Each
step is keyed to a Cliopatria slice — the year its area changes — and the shape
is authored here to match the area Cliopatria records for that slice inside
North America. Every drawn shape is then cut against the same Natural Earth
coastline the basemap is built from, so a colony's seaward edge is the real
coast and its bays are water rather than territory; only the inland frontier is
authored.

England opens in 1609 with Virginia alone and reaches roughly 150,000 km² by
1683; Britain inherits that in May 1707 and grows to about 500,000 by the
Proclamation of 1763, which is where the seaboard stops until the Treaty of
Paris hands the same shape to the United States. New France starts as
Champlain's habitation at Quebec at about 1,600 km² and reaches roughly 90,000
along the St Lawrence, the Ottawa and the north shores of the lakes by the
1750s; its valley spans are deliberately left uncut so the river they were
built on stays inside them. New Netherland and New Sweden are drawn for the
years they existed, which is why the English seaboard is two separate footholds
until 1664.

French Louisiana grows the same way, in eight steps keyed to the same source,
and is drawn as rivers and coast rather than as anything a later state line
follows. Fort Maurepas at Biloxi in 1699 is the whole colony for three years;
Fort Louis on the Mobile in 1702 makes the Gulf district, which runs from the
Pearl to the Perdido and stops there because Spain held Pensacola throughout;
Natchitoches on the Red in 1714 is the first ground away from the coast, facing
the Spanish presidio at Los Adaes; New Orleans in 1718 brings the Isle of
Orleans and the delta, with Natchez above them; the Company of the Indies
concessions of the 1720s fill the lower river, the Florida Parishes and the
Attakapas and Opelousas country behind it, with Arkansas Post at the mouth of
the Arkansas and the Illinois Country at Kaskaskia and Fort de Chartres, which
was attached to Louisiana in 1717; the retrocession to the crown in 1731 adds
the Red River road to Natchitoches, the west bank on to the Arkansas, and Sainte
Geneviève. Those six steps are settlement, and Cliopatria's figures are what
they are drawn to: about 2,700 km² in 1700, 51,000 by 1721, 55,000 by 1734.

The last two steps are the claim rather than the settlement, because that is
what actually changed hands. Fort de Cavagnial on the Missouri in 1744, after
Fort Orleans and the Mallet brothers' road to Santa Fe, takes the colony out
over the eastern half of the basin; by 1752 it is the whole of it. Both shapes
are cut from `louisiana-purchase` itself rather than drawn freehand, so their
eastern edge is already the Mississippi, and 1763 is a change of flag with
nothing moving on the map — the ground Spain takes at Fontainebleau, sells back
in 1800 and the United States buys in 1803 is the ground France is already
drawn holding. Cliopatria still records only about 57,000 km² of settled ground
inside it, which is what the six earlier steps show.

Two pieces of ground had to leave `florida` for that to be drawable, because
Spain did not hold either of them while the French were there: the Gulf coast
from the Pearl to the Perdido, which is Biloxi and Mobile and then the western
half of British West Florida, and the Florida Parishes, which are French until
1763, British until 1783 and Spanish only after that. Both are now parts of
their own, handed on with `florida` from 1763. The Mississippi delta's outer
passes moved the other way, into the Louisiana Purchase, so the whole delta
belongs to the river rather than to Florida.

New Spain grows the same way and from the same source: the central Mexican
domain Spain took from the Triple Alliance in 1521, west and south by 1526, the
silver country by 1534, Yucatán and Chiapas once the last Mayan city-states fell
in 1546, the northern mining frontier from 1595, and Sonora and Nuevo León by
1687 — at which point Cliopatria has New Spain holding effectively all of modern
Mexico, and the modern-boundary parts take over. Texas joins in 1716, Alta
California in 1769, and New Mexico is drawn separately from 1598 because the
part it sits in does not become Spanish in fact until 1769. Central America
follows its conquests: the Guatemalan highlands from 1524 but not the Petén,
which the Itza held until 1697; El Salvador, Honduras and Nicaragua from 1524;
Costa Rica from 1563; Panama from 1519. On the Plata the dates are the first
lasting settlements — Asunción in 1537, Santiago del Estero in 1553, Soriano in
1624 — rather than the year the Spanish Empire itself begins.

The Inca are staged the same way, from the 9,000 km² around Cusco that
Cliopatria records for 1440 to the 2.1 million of Tawantinsuyu at its height
after 1497, and then the Vilcabamba remnant to 1572.

In the north, Rupert's Land is British from Utrecht in 1713 rather than 1763,
Quebec and the maritime colonies from 1763, Labrador only from the Proclamation
that annexed it to Newfoundland, and the Arctic islands from the 1820s
voyages that claimed them. Each part is now its own span with its own date,
which is what lets them start at different times.

Where Cliopatria lets two claims overlap and this map cannot, the file says so:
the Haudenosaunee are drawn at the homeland extent recorded for 1450 and again
after 1701, because the Beaver Wars extent of the 1670s and 1680s would have to
run through French and English ground of the same years.

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

## Cultural regions

`data/cultural-regions/` is for a broad **Cultural region**: an approximate
area associated with a culture or society, not a state territory. Cultural
regions deliberately may overlap polities and one another. They draw beneath
polities with a low-opacity fill and dashed outline; italic labels keep them
from being read as political boundaries.

```json
{
  "name": "Example cultural region",
  "color": "#8f6e4a",
  "features": [
    { "from": "-1000", "to": "500", "geometry": { "type": "Polygon", "coordinates": [] },
      "source": "Brief citation or evidence note." }
  ]
}
```

The approximate shape is intentional. Do not give these entries a `status`:
`controlled`, `disputed`, and `contested` describe political possession.
Cultural regions are the one kind the overlap check skips entirely, on both
sides — against polities and against each other — which is what lets the Comanche
sit inside New Spain, and Choctaw and Chickasaw country meet along a frontier
neither of them drew as a line.

That exemption is also the only discipline this layer has, so the honesty has
to come from the sourcing instead. Two rules keep it from becoming a way to
draw whatever the polity layer refuses: a cultural region is the extent of a
people, never a claim or a military reach dressed up as one — the Haudenosaunee
Beaver Wars conquests are still not drawn, because they were a political extent
and belong in the polity layer or nowhere. And its span is the life of the
country, dated at both ends to something that happened: a treaty, a removal, a
dissolution. Regions are named for the people alone, in the form a
reader is most likely to know — Navajo, not Navajo country and not Diné
Bikéyah — with the people's own name for the country in the `source`, and the
file is named for the entry the same way the other two kinds are. Those ids all
share one space, so a region and a polity for the same people have to be told
apart by their names rather than by their directories: `cherokee.json` is the
region and `cherokee-nation.json` the polity, `powhatan.json` the region and
`powhatan-confederacy.json` the chiefdom. The build fails on a duplicate id
rather than quietly merging the two. Fifteen North American homelands are drawn on this basis; the
continent-wide culture areas of the standard schemes are deliberately not, since
ten shapes covering everything would fill in exactly the blanks this map keeps
on purpose.

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

## Unmapped societies

`data/unmapped/` is for an **Unmapped** society: one that belongs in chronology
and search but has no geographic extent we can responsibly render. Its file
has no colour, parts, features, or geometry; the build writes its spans to
`public/data/unmapped.json` for timeline UI.

```json
{
  "name": "Example unmapped society",
  "spans": [
    { "from": "-8000", "to": "-5000", "source": "Brief citation or evidence note." }
  ]
}
```

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
