/** The timeline's scale. The data is finer than this — see lib/time.ts — so
 *  the track can later zoom to months without the model changing. */
import { yearOf } from './time';

export const MIN_T = 1980;
export const MAX_T = 2026;

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

/** Every year is selectable and receives a tick; labels are shown at five-year intervals. */
export const TICKS = Array.from({ length: MAX_T - MIN_T + 1 }, (_, index) => MIN_T + index);
