/**
 * The tile eras, as the data build actually wrote them.
 *
 * A tile has no time in it, so a single worldwide pyramid had to carry every
 * span in history and let the style filter down to the handful alive at the
 * year on screen — about 2% of what was fetched. The build writes one pyramid
 * per era instead, and this is how the map finds the right one.
 *
 * The list is fetched rather than declared here on purpose. The build derives
 * it from the same periodisation the styling uses and then subdivides the long
 * eras, so a second copy of the boundaries in the client would be a copy of a
 * derived thing — right until someone changed MAX_ERA_SPAN and the map started
 * asking for tiles that were never written.
 */
export type TileEra = {
  id: string;
  /** Null at the open ends: no bound on this side. */
  from: number | null;
  to: number | null;
};

const ERAS_URL = '/data/polity-eras.json';

export const polityTilesUrl = (era: string) => `/data/polities/${era}/{z}/{x}/{y}.pbf`;
export const polityLabelsUrl = (era: string) => `/data/polity-labels/${era}.json`;

let pending: Promise<TileEra[]> | null = null;

/** The era list, fetched once and shared. */
export function loadTileEras(): Promise<TileEra[]> {
  pending ??= fetch(ERAS_URL).then((response) => {
    if (!response.ok) throw new Error(`${response.status} fetching ${ERAS_URL}`);
    return response.json() as Promise<TileEra[]>;
  });
  return pending;
}

/**
 * The era holding an instant. The build writes eras that tile the whole record
 * with open ends, so every year falls in one; the fallbacks are for a manifest
 * that has been narrowed without the map being reloaded, where the nearest end
 * of the record is a better answer than no tiles at all.
 */
export function eraForYear(eras: TileEra[], t: number): string {
  const hit = eras.find((era) => (era.from == null || t >= era.from) && (era.to == null || t < era.to));
  return (hit ?? (t < 0 ? eras[0] : eras[eras.length - 1]))?.id ?? '';
}
