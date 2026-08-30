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

## Layout

```
src/
  components/map/     HistoryMap (the island), Timeline, MapControls
  lib/mapStyle.ts     The MapLibre style
  lib/years.ts        Timeline scale and BC/AD formatting
  lib/store.ts        Zustand store
  lib/url.ts          View state in the URL
  pages/index.astro   The map
data/                 Basemap pipeline — see data/README.md
public/data/          Generated. Gitignored. Rebuild with `npm run data:build`.
```

## Notes

- The map renders physical geography only: land, lakes, rivers, coastlines.
- The timeline is **UI only**. Moving it updates the year in the store and in the
  URL; nothing is bound to it, because there is no time-varying data yet.
- Two fixes worth not regressing: MapLibre's worker is bundled via Vite
  (`?worker&url` + `setWorkerUrl`) because bundlers cannot preserve its own
  module-relative path, and the map probes for WebGL2 before initialising.
