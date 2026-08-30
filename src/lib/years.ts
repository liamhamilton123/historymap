/** Calendar-year formatting for the contemporary map timeline. */
export function formatYear(year: number): string {
  return String(Math.round(year));
}

/** Compact form for timeline tick labels. */
export function formatYearShort(year: number): string {
  return String(Math.round(year));
}

export const MIN_YEAR = 1980;
export const MAX_YEAR = 2026;

/** Year -> 0..1 position along the linear timeline track. */
export function yearToFraction(year: number): number {
  const clamped = Math.min(Math.max(year, MIN_YEAR), MAX_YEAR);
  return (clamped - MIN_YEAR) / (MAX_YEAR - MIN_YEAR);
}

/** 0..1 position along the track -> year. */
export function fractionToYear(fraction: number): number {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return Math.round(MIN_YEAR + clamped * (MAX_YEAR - MIN_YEAR));
}

/** Every year is selectable and receives a tick; labels are shown at five-year intervals. */
export const TICKS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, index) => MIN_YEAR + index);
