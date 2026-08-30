/** "500 BC", "1444", "AD 79" — historians' convention, no year zero. */
export function formatYear(year: number): string {
  const value = Math.round(year);
  if (value < 0) return `${Math.abs(value).toLocaleString()} BC`;
  if (value < 1000) return `AD ${value}`;
  return String(value);
}

/** Compact form for tick labels, where horizontal room is scarce. */
export function formatYearShort(year: number): string {
  const value = Math.round(year);
  const magnitude = Math.abs(value);
  const digits =
    magnitude >= 10000 ? `${Math.round(magnitude / 1000)}k` : magnitude.toLocaleString();
  return value < 0 ? `${digits} BC` : digits;
}

/**
 * Each segment gets a fixed share of the track, so the slider spends its pixels
 * on recent history instead of the Pleistocene.
 */
const SEGMENTS: Array<{ from: number; to: number; share: number }> = [
  { from: -10000, to: -3000, share: 0.1 },
  { from: -3000, to: 0, share: 0.2 },
  { from: 0, to: 1000, share: 0.18 },
  { from: 1000, to: 1500, share: 0.16 },
  { from: 1500, to: 1800, share: 0.16 },
  { from: 1800, to: 1900, share: 0.08 },
  { from: 1900, to: 2025, share: 0.12 },
];

const OFFSETS = SEGMENTS.reduce<number[]>((acc, segment) => {
  acc.push((acc.at(-1) ?? 0) + segment.share);
  return acc;
}, []);

export const MIN_YEAR = SEGMENTS[0].from;
export const MAX_YEAR = SEGMENTS.at(-1)!.to;

/** Year -> 0..1 position along the timeline track. */
export function yearToFraction(year: number): number {
  const clamped = Math.min(Math.max(year, MIN_YEAR), MAX_YEAR);
  for (const [index, segment] of SEGMENTS.entries()) {
    if (clamped <= segment.to || index === SEGMENTS.length - 1) {
      const start = index === 0 ? 0 : OFFSETS[index - 1];
      const progress = (clamped - segment.from) / (segment.to - segment.from);
      return start + progress * segment.share;
    }
  }
  return 1;
}

/** 0..1 position along the track -> year. */
export function fractionToYear(fraction: number): number {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  for (const [index, segment] of SEGMENTS.entries()) {
    const start = index === 0 ? 0 : OFFSETS[index - 1];
    const end = OFFSETS[index];
    if (clamped <= end || index === SEGMENTS.length - 1) {
      const progress = (clamped - start) / (end - start);
      return Math.round(segment.from + progress * (segment.to - segment.from));
    }
  }
  return MAX_YEAR;
}

/** Labelled ticks for the timeline gutter. */
export const TICKS = [-10000, -3000, -1000, 0, 500, 1000, 1500, 1800, 1900, 2000];
