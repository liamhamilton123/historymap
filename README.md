# Atlas

An interactive map, built as an Astro site with a single MapLibre island.

```bash
npm install
npm run data:build   # downloads + builds the basemap. Required once.
npm run dev
```

## Stack

| | |
| --- | --- |
| **Astro** | Static site + island architecture. Content pages ship zero JavaScript. |
| **React** | Exactly one island: the map. |
| **MapLibre GL JS** | GPU vector rendering, no API key, no per-load billing. |
| **Zustand** | Map UI state. |
| **Tailwind CSS** | Required styling system for all new UI work. |

## Layout

```
src/
  components/map/     HistoryMap (the island), Timeline, MapControls, polityLabels
  lib/mapStyle.ts     The MapLibre style, POLITY_STATUS — the one place a
                      status's fill, stripes, outline and label are defined —
                      and UNCLAIMED, the same for ground with no owner
  lib/hatch.ts        Generates the diagonal stripe patterns for disputed and
                      contested land, in either lean and any colour
  lib/time.ts         Instants as decimal years; ISO dates in and out
  lib/years.ts        Timeline scale and BC/AD formatting
  lib/store.ts        Zustand store
  lib/url.ts          View state in the URL
  pages/index.astro   Landing page
  pages/map.astro     The interactive map
data/polities/        One file per polity — see data/README.md
data/unclaimed/       One file per named piece of ground nobody held
data/                 Basemap pipeline — see data/README.md
public/data/          Generated. Gitignored. Rebuild with `npm run data:build`.
                      basemap.geojson, polities.geojson, polity-labels.json,
                      polity-hatches.json
```

## Notes

- The map renders physical geography only: land, lakes, rivers, coastlines.
- The timeline is **UI only**. Moving it updates the year in the store and in the
  URL; nothing is bound to it, because there is no time-varying data yet.
- Use Tailwind utilities for all future styling. The only global selectors are
  Tailwind `@apply` overrides for MapLibre-owned markup.
- Two fixes worth not regressing: MapLibre's worker is bundled via Vite
  (`?worker&url` + `setWorkerUrl`) because bundlers cannot preserve its own
  module-relative path, and the map probes for WebGL2 before initialising.
