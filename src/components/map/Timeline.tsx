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
    <div className="timeline panel">
      <div className="timeline-head">
        <button
          className="icon-button play"
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

        <div className="year-readout">
          <span className="year-value">{formatYear(year)}</span>
        </div>

        <div className="stepper">
          <button className="icon-button" onClick={() => step(-1)} title="Back (←)" aria-label="Back">
            <ChevronIcon direction="left" />
          </button>
          <button className="icon-button" onClick={() => step(1)} title="Forward (→)" aria-label="Forward">
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>

      <div className="track">
        <div className="track-line" />
        <div className="track-fill" style={{ width: `${fraction * 100}%` }} />
        <span className="thumb" style={{ left: `${fraction * 100}%` }} />
        <input
          className="track-input"
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
      </div>

      <div className="ticks" aria-hidden="true">
        {TICKS.map((tick) => (
          <span key={tick} className="tick" style={{ left: `${yearToFraction(tick) * 100}%` }}>
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
