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

const RESOLUTION = 2000;
/** Arrow-key step, in years. */
const STEP = 25;
/** Seconds for playback to travel the whole track. */
const PLAYBACK_DURATION = 60;

/**
 * The timeline UI. Nothing is bound to it yet — moving it changes the year in
 * the store and nothing else, because there is no time-varying data to filter.
 */
export default function Timeline() {
  const year = useMapStore((state) => state.year);
  const playing = useMapStore((state) => state.playing);
  const setYear = useMapStore((state) => state.setYear);
  const togglePlaying = useMapStore((state) => state.togglePlaying);
  const setPlaying = useMapStore((state) => state.setPlaying);

  const fraction = yearToFraction(year);
  const beginHistory = () => window.dispatchEvent(new Event('atlas:history-start'));
  const step = (direction: 1 | -1) => {
    beginHistory();
    setPlaying(false);
    setYear(Math.min(Math.max(year + direction * STEP, MIN_YEAR), MAX_YEAR));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        event.preventDefault();
        if (!playing) beginHistory();
        togglePlaying();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        step(event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playing, togglePlaying]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      const state = useMapStore.getState();
      const next = fractionToYear(yearToFraction(state.year) + delta / PLAYBACK_DURATION);
      if (next >= MAX_YEAR) {
        state.setYear(MAX_YEAR);
        state.setPlaying(false);
        return;
      }
      state.setYear(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return (
    <div className="absolute bottom-3 left-1/2 z-[5] w-[min(940px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-white/9 bg-panel/82 px-3.5 pt-3 pb-2 shadow-panel backdrop-blur-[18px] backdrop-saturate-[140%] sm:bottom-[22px] sm:px-5 sm:pt-3.5 sm:pb-2.5">
      <div className="mb-2.5 flex items-center gap-3.5">
        <button
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-white/9 bg-white/4 transition-[background-color,border-color] duration-120 hover:border-white/16 hover:bg-white/10 aria-pressed:border-accent aria-pressed:bg-accent/15 aria-pressed:text-accent"
          onClick={() => {
            if (!playing) beginHistory();
            togglePlaying();
          }}
          aria-pressed={playing}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (space)' : 'Play (space)'}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className="min-w-0 flex-1">
          <span className="font-serif text-[22px] leading-[1.1] tracking-[0.01em] tabular-nums sm:text-[28px]">{formatYear(year)}</span>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button className="grid size-[34px] cursor-pointer place-items-center rounded-[9px] border border-white/9 bg-white/4 transition-[background-color,border-color] duration-120 hover:border-white/16 hover:bg-white/10" onClick={() => step(-1)} title="Back (←)" aria-label="Back">
            <ChevronIcon direction="left" />
          </button>
          <button className="grid size-[34px] cursor-pointer place-items-center rounded-[9px] border border-white/9 bg-white/4 transition-[background-color,border-color] duration-120 hover:border-white/16 hover:bg-white/10" onClick={() => step(1)} title="Forward (→)" aria-label="Forward">
            <ChevronIcon direction="right" />
          </button>
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
            setPlaying(false);
            setYear(fractionToYear(Number(event.target.value) / RESOLUTION));
          }}
          aria-label="Year"
          aria-valuetext={formatYear(year)}
        />
        <span className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(224,184,114,0.18),0_2px_8px_rgba(0,0,0,0.5)] transition-shadow duration-140 group-hover:shadow-[0_0_0_7px_rgba(224,184,114,0.22),0_2px_10px_rgba(0,0,0,0.55)] peer-focus-visible:shadow-[0_0_0_7px_rgba(224,184,114,0.4)]" style={{ left: `${fraction * 100}%` }} />
      </div>

      <div className="relative mt-0.5 h-4" aria-hidden="true">
        {TICKS.map((tick) => (
          <span key={tick} className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-ink-faint even:hidden sm:even:inline" style={{ left: `${yearToFraction(tick) * 100}%` }}>
            {formatYearShort(tick)}
          </span>
        ))}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <path d="M3 1.5 12 7l-9 5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <rect x="3" y="2" width="3" height="10" rx="1" />
      <rect x="8" y="2" width="3" height="10" rx="1" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="14"
      height="14"
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
