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
export const NON_STATE_PEOPLES_DIR = join(ROOT, 'data', 'non-state-peoples');

/** Physical layers, drawn as the basemap. */
export const NATURAL_EARTH_LAYERS = [
  { file: 'ne_50m_land', kind: 'land' },
  { file: 'ne_50m_lakes', kind: 'lake' },
  { file: 'ne_50m_rivers_lake_centerlines', kind: 'river' },
];

/**
 * Cliopatria / Seshat Global History Databank: historical polity extents,
 * CC BY 4.0. Not read by the build — it is the input to the one-off importer,
 * data/scripts/import-cliopatria.mjs, which writes polity files that are then
 * committed and read like any other.
 */
export const CLIOPATRIA_URL =
  'https://github.com/Seshat-Global-History-Databank/cliopatria/raw/main/cliopatria.geojson.zip';
export const CLIOPATRIA_FILE = join(SOURCES_DIR, 'cliopatria', 'cliopatria_polities_only.geojson');
