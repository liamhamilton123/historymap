import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://example.com',
  integrations: [react()],
  vite: {
    // MapLibre's worker is a real module that imports a sibling chunk, so it
    // has to be bundled as a worker rather than copied as an asset. See the
    // setWorkerUrl call in HistoryMap.tsx.
    worker: { format: 'es' },
    resolve: {
      alias: { '~': new URL('./src', import.meta.url).pathname },
    },
  },
});
