import { useEffect } from 'react';
import { useMapStore } from '~/lib/store';
import { historicalThemeForYear, HISTORICAL_THEME_TITLE } from '~/lib/mapStyle';
import {
  MIN_T,
  MAX_T,
  TICKS,
  clampT,
  isLabelledTick,
  formatYear,
  formatYearShort,
  fractionToT,
  tToFraction,
} from '~/lib/years';

/**
 * How many positions the range input has along the track. The track is warped
 * — see lib/years.ts — so this is a count of steps along its *length*, not a
 * count of years: a step is under a year in the recent segments and several in
 * the stone age. Every year stays reachable regardless, because the step
 * buttons and the arrow keys move in years rather than through this.
 */
const RESOLUTION = MAX_T - MIN_T;
/** Arrow-key step, in years. */
const STEP = 1;
/**
 * The jumps the step buttons offer, smallest first. The track is warped, so a
 * drag covers wildly different amounts of time depending where the handle is;
 * these are how you move a known number of years instead of a known number of
 * pixels, which is the only way to cross the wide early segments deliberately.
 */
const STEPS = [1, 10, 100] as const;
/**
 * The timeline UI. It steps in whole years, but the instant it writes to the
 * store is a decimal year, so a finer track can be added without the data or
 * the map filter changing.
 */
export default function Timeline() {
  const t = useMapStore((state) => state.t);
  const setT = useMapStore((state) => state.setT);
  // Named here rather than in the controls panel: it says which age the year
  // belongs to, so it belongs with the year and not with a rendering toggle.
  const era = HISTORICAL_THEME_TITLE[historicalThemeForYear(t)];

  const fraction = tToFraction(t);
  const beginHistory = () => window.dispatchEvent(new Event('policarta:history-start'));
  const step = (direction: 1 | -1, amount = 1) => {
    beginHistory();
    setT(clampT(Math.floor(t) + direction * amount));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        step(event.key === 'ArrowRight' ? 1 : -1, STEP);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="timeline-panel absolute bottom-3 left-1/2 z-[5] w-[min(940px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-ink/12 bg-panel/55 px-3.5 pt-3 pb-2 shadow-panel backdrop-blur-[8px] backdrop-saturate-[140%] sm:bottom-[22px] sm:px-5 sm:pt-3.5 sm:pb-2.5">
      <div className="mb-3 flex items-center justify-center gap-2 sm:gap-3">
        <div className="flex gap-1">
          {[...STEPS].reverse().map((years) => (
            <StepButton key={years} direction="left" years={years} onClick={() => step(-1, years)} />
          ))}
        </div>
        {/* No font-family utility on either line: the era themes set one on
            .timeline-year, and a utility on a child would win over it. */}
        <span className="timeline-year min-w-22 rounded-xl border border-accent/25 bg-accent/10 px-2 py-1.5 text-center shadow-[inset_0_1px_rgba(255,255,255,0.08)] sm:min-w-24">
          <span className="block text-[22px] leading-[1.1] tracking-[0.01em] text-accent tabular-nums sm:text-[28px]">
            {formatYear(t)}
          </span>
          <span className="mt-0.5 block text-[8px] leading-tight font-medium tracking-[0.1em] text-accent/70 uppercase sm:text-[9px]">
            {era}
          </span>
        </span>
        <div className="flex gap-1">
          {STEPS.map((years) => (
            <StepButton key={years} direction="right" years={years} onClick={() => step(1, years)} />
          ))}
        </div>
      </div>

      <div className="group relative flex h-6 items-center">
        <div className="pointer-events-none absolute right-0 left-0 h-0.75 rounded-sm bg-ink/10" />
        <div className="pointer-events-none absolute left-0 h-0.75 rounded-sm bg-linear-to-r from-accent/35 to-accent" style={{ width: `${fraction * 100}%` }} />
        <input
          className="peer absolute inset-0 m-0 w-full cursor-pointer appearance-none bg-transparent opacity-0"
          type="range"
          min={0}
          max={RESOLUTION}
          step={1}
          value={Math.round(fraction * RESOLUTION)}
          onPointerDown={beginHistory}
          onChange={(event) => {
            setT(fractionToT(Number(event.target.value) / RESOLUTION));
          }}
          aria-label="Year"
          aria-valuetext={formatYear(t)}
        />
        <span className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(224,184,114,0.18),0_2px_8px_rgba(0,0,0,0.5)] transition-shadow duration-140 group-hover:shadow-[0_0_0_7px_rgba(224,184,114,0.22),0_2px_10px_rgba(0,0,0,0.55)] peer-focus-visible:shadow-[0_0_0_7px_rgba(224,184,114,0.4)]" style={{ left: `${fraction * 100}%` }} />
      </div>

      <div className="relative mt-0.5 h-6" aria-hidden="true">
        {TICKS.map((tick) => (
          <span key={tick} className="absolute top-0 -translate-x-1/2" style={{ left: `${tToFraction(tick) * 100}%` }}>
            <span className="mx-auto block h-1 w-px bg-ink/25" />
            {isLabelledTick(tick) && (
              <span className="mt-1 block text-center whitespace-nowrap font-mono text-[10px] text-ink-faint">
                {formatYearShort(tick)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepButton({ direction, years, onClick }: { direction: 'left' | 'right'; years: number; onClick: () => void }) {
  const label = `${direction === 'left' ? 'Previous' : 'Next'} ${years} ${years === 1 ? 'year' : 'years'}`;
  // One chevron per step up the scale, so the buttons read as a progression
  // rather than three identical arrows distinguished only by their number.
  const chevronCount = STEPS.indexOf(years as (typeof STEPS)[number]) + 1;
  return (
    <button
      className="group flex h-11 min-w-10 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-ink/10 bg-ink/5 px-1 text-[10px] font-semibold leading-none text-ink-dim tabular-nums shadow-[inset_0_1px_rgba(255,255,255,0.06)] transition-all duration-150 hover:-translate-y-px hover:border-accent/60 hover:bg-accent/12 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <span className="flex -space-x-2 text-ink-faint transition-colors group-hover:text-accent">
        {Array.from({ length: chevronCount }, (_, index) => <ChevronIcon key={index} direction={direction} />)}
      </span>
      <span className="text-[8px]">{years}</span>
    </button>
  );
}

/**
 * The arrow on a step button. Drawn small: three of them stacked have to sit
 * inside a button that is mostly there to be hit, not read, and the number
 * underneath is what actually says how far the jump goes. The stroke is
 * heavier in viewBox units than the size cut alone would give, so the smaller
 * glyph does not thin out to a wisp.
 */
function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: direction === 'left' ? 'rotate(180deg)' : undefined }}
    >
      <path d="m5 2 5 5-5 5" />
    </svg>
  );
}
