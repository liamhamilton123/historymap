import { useEffect } from 'react';
import { useMapStore } from '~/lib/store';
import {
  MIN_YEAR,
  MAX_YEAR,
  TICKS,
  formatYear,
  formatYearShort,
  fractionToYear,
  yearToFraction,
} from '~/lib/years';

const RESOLUTION = MAX_YEAR - MIN_YEAR;
/** Arrow-key step, in years. */
const STEP = 1;
/**
 * The timeline UI. Nothing is bound to it yet — moving it changes the year in
 * the store and nothing else, because there is no time-varying data to filter.
 */
export default function Timeline() {
  const year = useMapStore((state) => state.year);
  const setYear = useMapStore((state) => state.setYear);

  const fraction = yearToFraction(year);
  const beginHistory = () => window.dispatchEvent(new Event('atlas:history-start'));
  const step = (direction: 1 | -1, amount = 1) => {
    beginHistory();
    setYear(Math.min(Math.max(year + direction * amount, MIN_YEAR), MAX_YEAR));
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
    <div className="absolute bottom-3 left-1/2 z-[5] w-[min(940px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-white/9 bg-panel/82 px-3.5 pt-3 pb-2 shadow-panel backdrop-blur-[18px] backdrop-saturate-[140%] sm:bottom-[22px] sm:px-5 sm:pt-3.5 sm:pb-2.5">
      <div className="mb-3 flex items-center justify-center gap-2 sm:gap-3">
        <div className="flex gap-1">
          <StepButton direction="left" years={50} onClick={() => step(-1, 50)} />
          <StepButton direction="left" years={5} onClick={() => step(-1, 5)} />
          <StepButton direction="left" years={1} onClick={() => step(-1, 1)} />
        </div>
        <span className="min-w-22 rounded-xl border border-accent/25 bg-accent/10 px-2 py-2 text-center font-serif text-[22px] leading-[1.1] tracking-[0.01em] text-accent tabular-nums shadow-[inset_0_1px_rgba(255,255,255,0.08)] sm:min-w-24 sm:text-[28px]">{formatYear(year)}</span>
        <div className="flex gap-1">
          <StepButton direction="right" years={1} onClick={() => step(1, 1)} />
          <StepButton direction="right" years={5} onClick={() => step(1, 5)} />
          <StepButton direction="right" years={50} onClick={() => step(1, 50)} />
        </div>
      </div>

      <div className="group relative flex h-6 items-center">
        <div className="pointer-events-none absolute right-0 left-0 h-0.75 rounded-sm bg-white/10" />
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
            setYear(fractionToYear(Number(event.target.value) / RESOLUTION));
          }}
          aria-label="Year"
          aria-valuetext={formatYear(year)}
        />
        <span className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(224,184,114,0.18),0_2px_8px_rgba(0,0,0,0.5)] transition-shadow duration-140 group-hover:shadow-[0_0_0_7px_rgba(224,184,114,0.22),0_2px_10px_rgba(0,0,0,0.55)] peer-focus-visible:shadow-[0_0_0_7px_rgba(224,184,114,0.4)]" style={{ left: `${fraction * 100}%` }} />
      </div>

      <div className="relative mt-0.5 h-6" aria-hidden="true">
        {TICKS.map((tick) => (
          <span key={tick} className="absolute top-0 -translate-x-1/2" style={{ left: `${yearToFraction(tick) * 100}%` }}>
            <span className="mx-auto block h-1 w-px bg-white/25" />
            {(tick % 5 === 0 || tick === MAX_YEAR) && (
              <span className="mt-1 block -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-ink-faint">
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
  const chevronCount = years === 50 ? 3 : years === 5 ? 2 : 1;
  return (
    <button
      className="group flex h-11 min-w-10 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-white/8 bg-white/5 px-1 text-[10px] font-semibold leading-none text-ink-dim tabular-nums shadow-[inset_0_1px_rgba(255,255,255,0.06)] transition-all duration-150 hover:-translate-y-px hover:border-accent/60 hover:bg-accent/12 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <span className="flex -space-x-3 text-ink-faint transition-colors group-hover:text-accent">
        {Array.from({ length: chevronCount }, (_, index) => <ChevronIcon key={index} direction={direction} />)}
      </span>
      <span className="text-[8px]">{years}</span>
    </button>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: direction === 'left' ? 'rotate(180deg)' : undefined }}
    >
      <path d="m5 2 5 5-5 5" />
    </svg>
  );
}
