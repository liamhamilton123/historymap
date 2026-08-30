/**
 * Time is a single number: the decimal year. Everything — the timeline, the
 * URL, the polity data — reduces to it, so day-level and century-level events
 * compare the same way and no code has to know which resolution it is at.
 */

/** The value a still-current polity carries instead of an end date. */
export const OPEN_ENDED = 9999;

const DAYS_PER_YEAR = 365;
/** Days elapsed before the 1st of each month. Leap years are ignored on
 *  purpose: the fraction orders events within a year, it is not a calendar. */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/**
 * `YYYY`, `YYYY-MM` or `YYYY-MM-DD` (negative years allowed) -> decimal year.
 * Mirrored by toInstant in data/scripts/build-polities.mjs — change both.
 */
export function parseInstant(iso: string): number | null {
  const match = /^(-?\d{1,6})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return year + (MONTH_START[month - 1]! + day - 1) / DAYS_PER_YEAR;
}

/**
 * Decimal year -> the shortest ISO form that parses back to it. A date on
 * 1 January is written as the bare year, since that is the same instant.
 */
export function formatInstant(t: number): string {
  const year = Math.floor(t);
  const days = Math.round((t - year) * DAYS_PER_YEAR);
  if (days <= 0) return String(year);
  let month = 12;
  while (month > 1 && MONTH_START[month - 1]! > days) month--;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(days - MONTH_START[month - 1]! + 1)}`;
}

/** The calendar year an instant falls in. */
export function yearOf(t: number): number {
  return Math.floor(t);
}
