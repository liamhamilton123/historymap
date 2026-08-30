/** The timeline's scale. The data is finer than this — see lib/time.ts — so
 *  the track can later zoom to months without the model changing. */
import { yearOf } from './time';

/**
 * The span the track covers. It starts before the earliest data rather than on
 * it — 1783 for North America, 1922 for the Soviet Union — so the first thing
 * on the map is something you scrub *to*, not something already there when the
 * handle bottoms out.
 */
export const MIN_T = 1750;
export const MAX_T = 2026;

/**
 * Tick spacing, in years. The track is a fixed width and the span is now wide
 * enough that a tick per year would be a solid grey bar, so ticks are decades
 * and only the half-centuries are written. The slider itself still steps one
 * year at a time; this is only what gets drawn.
 */
const TICK_STEP = 10;
const LABEL_STEP = 50;

/** Full label for the current instant. */
export function formatYear(t: number): string {
  return String(yearOf(t));
}

/** Compact form for timeline tick labels. */
export function formatYearShort(t: number): string {
  return String(yearOf(t));
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
