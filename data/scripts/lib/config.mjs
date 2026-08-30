import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..', '..');
export const SOURCES_DIR = join(ROOT, 'data', 'sources');
export const OUT_DIR = join(ROOT, 'public', 'data');

/** Physical layers, drawn as the basemap. */
export const NATURAL_EARTH_LAYERS = [
  { file: 'ne_50m_land', kind: 'land' },
  { file: 'ne_50m_lakes', kind: 'lake' },
  { file: 'ne_50m_rivers_lake_centerlines', kind: 'river' },
];
