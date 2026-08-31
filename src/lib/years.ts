/** The timeline's scale. The data is finer than this — see lib/time.ts — so
 *  the track can later zoom to months without the model changing. */
import { yearOf } from './time';

/**
 * The span the track covers. It reaches back past the earliest polity data —
 * 1783 for North America, 1922 for the Soviet Union — because the map's era
 * themes run to the stone age, and an era the handle cannot reach may as well
 * not exist. The cost is deliberate and known: the centuries that actually
 * carry data are a small fraction of a linear track this wide, so the drag is
 * coarse there and the step buttons are what you reach for to land on a year.
 */
export const MIN_T = -10000;
export const MAX_T = 2026;

/**
 * Tick spacing, in years. The track is a fixed width and the span covers twelve
 * millennia, so ticks are quarter-millennia and only the millennia are written.
 * The slider itself still steps one year at a time; this is only what gets
 * drawn.
 */
const TICK_STEP = 250;
const LABEL_STEP = 1000;

/**
 * A year with its era, for anywhere a bare number would be ambiguous now that
 * the track runs either side of zero.
 *
 * The data numbers years astronomically — negative for BCE, with a year zero —
 * and this labels them the way they were given rather than shifting by one to
 * the historians' convention. So -3000 reads as 3000 BCE, which is the year the
 * bronze age boundary was set at, and not as 3001 BCE.
 */
function withEra(year: number): string {
  if (year < 0) return `${-year} BCE`;
  if (year === 0) return '0';
  if (year < 1000) return `${year} CE`;
  return String(year);
}

/** Full label for the current instant. */
export function formatYear(t: number): string {
  return withEra(yearOf(t));
}

/** Compact form for timeline tick labels. */
export function formatYearShort(t: number): string {
  return withEra(yearOf(t));
}

/** Instant -> 0..1 position along the linear timeline track. */
export function tToFraction(t: number): number {
  const clamped = Math.min(Math.max(t, MIN_T), MAX_T);
  return (clamped - MIN_T) / (MAX_T - MIN_T);
}

/** 0..1 position along the track -> instant, snapped to whole years for now. */
export function fractionToT(fraction: number): number {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return Math.round(MIN_T + clamped * (MAX_T - MIN_T));
}

export function clampT(t: number): number {
  return Math.min(Math.max(t, MIN_T), MAX_T);
}

/** Every year is selectable; a tick is drawn each decade, plus one at the end. */
export const TICKS = (() => {
  const ticks: number[] = [];
  for (let year = Math.ceil(MIN_T / TICK_STEP) * TICK_STEP; year <= MAX_T; year += TICK_STEP) {
    ticks.push(year);
  }
  if (ticks[ticks.length - 1] !== MAX_T) ticks.push(MAX_T);
  return ticks;
})();

/** Which ticks carry a written year. The last one always does, so the end of
 *  the track reads as a date rather than an unexplained mark. */
export function isLabelledTick(tick: number): boolean {
  return tick % LABEL_STEP === 0 || tick === MAX_T;
}
