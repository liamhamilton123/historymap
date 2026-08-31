/** The timeline's scale. The data is finer than this — see lib/time.ts — so
 *  the track can later zoom to months without the model changing. */
import { yearOf } from './time';

/**
 * The span the track covers. It reaches back past the earliest polity data —
 * 1783 for North America, 1922 for the Soviet Union — because the map's era
 * themes run to the stone age, and an era the handle cannot reach may as well
 * not exist.
 */
export const MIN_T = -7000;

/**
 * The track ends at the present, not at a year someone typed. The floor is the
 * last year known to be covered by the data, so a viewer whose system clock is
 * wrong can only ever be shown a track that runs too far, never one that stops
 * short of history the map can actually draw.
 *
 * This is read once, in the browser: the map island is client:only, so there is
 * no server render holding a build-time year for this to disagree with.
 */
const DATA_THROUGH = 2026;
export const MAX_T = Math.max(DATA_THROUGH, new Date().getFullYear());

/**
 * The track is not linear in time, and could not usefully be: nine millennia
 * drawn to scale would put every year anyone has data for inside the last three
 * per cent of it. So a recent year is simply worth more track than an old one,
 * and the rate steps up at four points — 1200 BCE, 700 BCE, 1000 CE and 1750.
 * Each step is two to four times the rate before it, so the track accelerates
 * towards the present rather than jumping there.
 *
 * These breakpoints are not the era boundaries in lib/mapStyle.ts, and are not
 * meant to be. The eras decide how the map is drawn; this decides how much room
 * a century is worth reading about. A theme changing mid-segment is expected.
 *
 * `share` is relative, not a percentage; only the ratios matter. Nothing here
 * says where the tick marks go — they are spaced along the track rather than
 * through the segments, so that they come out even. See TICKS.
 */
const SEGMENTS = [
  { from: MIN_T, to: -1200, share: 5 }, //    0.9% of the track per millennium
  { from: -1200, to: -700, share: 2 }, //     4.0%
  { from: -700, to: 1000, share: 22 }, //    12.9%
  { from: 1000, to: 1750, share: 27 }, //    36.0%
  { from: 1750, to: MAX_T, share: 44 }, //  159.4%
] as const;

/** Each segment with the slice of 0..1 it occupies, resolved once. */
const TRACK = (() => {
  const total = SEGMENTS.reduce((sum, segment) => sum + segment.share, 0);
  let start = 0;
  return SEGMENTS.map((segment, index) => {
    // The last segment takes whatever is left rather than its own share, so
    // the track ends at exactly 1 instead of a float's width short of it.
    const width = index === SEGMENTS.length - 1 ? 1 - start : segment.share / total;
    const slice = { ...segment, start, width };
    start += width;
    return slice;
  });
})();

/**
 * The years written on the track. Chosen for spacing rather than taken from the
 * segments: the scale's breakpoints are not all far enough apart to carry a
 * label each — 1200 BCE and 700 BCE are a few pixels apart — and the stretches
 * between them are long enough to want a mark of their own. Every year here
 * must also be a tick, or its label would sit above nothing.
 *
 * The near end is deliberately bare. Labelling it would set a floor under how
 * narrow the oldest segment could be, and that segment has the least reason to
 * be wide. The track still starts where the leftmost tick says it does.
 */
const LABELLED = new Set<number>([-1200, 1, 1000, 1500, 1800, 1900, MAX_T]);

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
  // The suffix is only there to stop an early year reading as a BCE one. Past
  // late antiquity nobody needs telling which side of zero a date is on, and
  // "800 CE" starts to look like an annotation rather than a year.
  if (year <= 500) return `${year} CE`;
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

/** Instant -> 0..1 position along the warped timeline track. */
export function tToFraction(t: number): number {
  const clamped = clampT(t);
  for (const segment of TRACK) {
    if (clamped > segment.to) continue;
    const within = (clamped - segment.from) / (segment.to - segment.from);
    return segment.start + within * segment.width;
  }
  return 1;
}

/** 0..1 position along the track -> instant, snapped to whole years for now. */
export function fractionToT(fraction: number): number {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  for (const segment of TRACK) {
    if (clamped > segment.start + segment.width) continue;
    const within = (clamped - segment.start) / segment.width;
    return Math.round(segment.from + within * (segment.to - segment.from));
  }
  return MAX_T;
}

export function clampT(t: number): number {
  return Math.min(Math.max(t, MIN_T), MAX_T);
}

/** Roughly how many marks the track carries, end to end. */
const TICK_COUNT = 24;

/**
 * The round numbers a tick is allowed to land on, coarsest first. A tick near
 * the present may sit on a multiple of 25; one out in prehistory has to sit on
 * a multiple of a thousand or it reads as a precision the scale cannot show.
 */
const TICK_LADDER = [5000, 2500, 1000, 500, 250, 100, 50, 25, 10, 5, 1];

/**
 * The marks under the track.
 *
 * These are placed by *position*, not by period: the track is walked in equal
 * steps and each step's year is snapped to the roundest number that fits the
 * local scale. Spacing ticks through time instead — a mark every N years within
 * each segment — is what made them bunch up, because a segment that is three
 * per cent of the track and one that is forty per cent cannot share a period
 * and come out looking alike.
 *
 * Because the snap moves a tick by at most half a step, the marks stay within
 * half a gap of even. Labelled years and the two ends are then forced in, and
 * any generated mark that lands too close to one of them is dropped rather than
 * drawn as a thickened hairline beside it.
 */
export const TICKS = (() => {
  const nominal = 1 / TICK_COUNT;
  const generated: number[] = [];
  for (let i = 1; i < TICK_COUNT; i++) {
    const at = i / TICK_COUNT;
    // The years one step of the track covers here, which is the finest a tick
    // can meaningfully claim to be.
    const span = fractionToT(Math.min(1, at + nominal / 2)) - fractionToT(at - nominal / 2);
    // Half a step, not a whole one: snapping to the coarsest number that merely
    // fits can shove a tick most of the way to its neighbour, which is the
    // opposite of what the snap is for.
    const step = TICK_LADDER.find((rung) => rung <= span / 2) ?? 1;
    generated.push(Math.round(fractionToT(at) / step) * step);
  }

  const fixed = new Set<number>([MIN_T, MAX_T, ...LABELLED]);
  const kept: number[] = [];
  for (const tick of [...new Set([...fixed, ...generated])].sort((a, b) => a - b)) {
    const previous = kept[kept.length - 1];
    if (previous !== undefined && tToFraction(tick) - tToFraction(previous) < nominal / 2) {
      // Two marks this close read as one. The fixed one wins: a label must keep
      // its mark, and the ends are where the track visibly begins and ends.
      if (!fixed.has(tick)) continue;
      if (!fixed.has(previous)) kept.pop();
    }
    kept.push(tick);
  }
  return kept;
})();

/** Which ticks carry a written year: the era boundaries, and the two ends. */
export function isLabelledTick(tick: number): boolean {
  return LABELLED.has(tick);
}
