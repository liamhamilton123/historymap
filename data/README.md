# Data pipeline

| Command | Does |
| --- | --- |
| `npm run data:fetch` | Downloads Natural Earth into `data/sources/` (gitignored). Cached; `--force` to redownload. |
| `npm run data:basemap` | Simplifies land, lakes and rivers into `public/data/basemap.geojson`. |
| `npm run data:polities` | Builds `public/data/polities.geojson` and `polity-labels.json` from `data/polities/`. |
| `npm run data:build` | All three, in order. |

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

`controlled` is ground held and not seriously contested; `disputed` is ground
held in fact but whose claim is rejected — occupation, annexation, unrecognised
secession. A disputed span is drawn with diagonal stripes over its fill and a
dashed outline.

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
geometric rather than a comparison of dates.

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

## Simplification

Every part is simplified once, together, as a shared topology — a border
between two neighbours is one arc, simplified one way. This is why the
tolerance (`SIMPLIFY_WEIGHT` in `build-polities.mjs`) is global rather than
per polity: give two neighbours their own tolerances and their shared border
simplifies two ways, leaving a sliver along every frontier. Per-polity
`minArea` is safe and is supported as a field on a polity file.

## Checks

The build exits non-zero on any of:

- a part id that does not exist, or a carve that selects nothing
- a span that ends before it starts, or one using an unknown `status`
- **the same ground claimed twice at one instant** — by two polities, which is
  the failure the parts bin exists to prevent, or by one polity, which means a
  duplicated span. Every pair whose spans and bounding boxes both overlap is
  actually intersected.
- geometry that disappears entirely once specks are dropped

## Source

[Natural Earth](https://www.naturalearthdata.com/) via `nvkelso/natural-earth-vector`,
1:50m physical layers. Public domain — anything derived from it is unencumbered.

Each feature is tagged with a `kind` (`land`, `lake`, `river`) so the map style
can drive all three from one source.
