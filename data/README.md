# Data pipeline

Physical basemap only — no political or historical data.

| Command | Does |
| --- | --- |
| `npm run data:fetch` | Downloads Natural Earth land, lakes and rivers into `data/sources/` (gitignored). Cached; `--force` to redownload. |
| `npm run data:basemap` | Simplifies and merges them into `public/data/basemap.geojson`. |
| `npm run data:build` | Both, in order. |

## Source

[Natural Earth](https://www.naturalearthdata.com/) via `nvkelso/natural-earth-vector`,
1:50m physical layers. Public domain — anything derived from it is unencumbered.

Each feature is tagged with a `kind` (`land`, `lake`, `river`) so the map style
can drive all three from one source.
