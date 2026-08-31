import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..', '..');
export const SOURCES_DIR = join(ROOT, 'data', 'sources');
export const OUT_DIR = join(ROOT, 'public', 'data');

export const POLITIES_DIR = join(ROOT, 'data', 'polities');
/**
 * Named ground that no polity held. The same shape of file as a polity, minus
 * everything that implies an owner — see data/README.md.
 */
export const UNCLAIMED_DIR = join(ROOT, 'data', 'unclaimed');
/**
 * Broad, deliberately imprecise spatial associations. Unlike polities these
 * may overlap one another and held ground.
 */
export const CULTURAL_REGIONS_DIR = join(ROOT, 'data', 'cultural-regions');
/** Timeline entities with no map extent that can responsibly be drawn. */
export const UNMAPPED_DIR = join(ROOT, 'data', 'unmapped');
export const PARTS_FILE = join(ROOT, 'data', 'parts.json');

/** Physical layers, drawn as the basemap. */
export const NATURAL_EARTH_LAYERS = [
  { file: 'ne_50m_land', kind: 'land' },
  { file: 'ne_50m_lakes', kind: 'lake' },
  { file: 'ne_50m_rivers_lake_centerlines', kind: 'river' },
];

/**
 * Modern country outlines. Not drawn — they are the parts bin the polity build
 * assembles historical shapes from, keyed by ADM0_A3.
 */
export const NATURAL_EARTH_PARTS = 'ne_50m_admin_0_countries';
