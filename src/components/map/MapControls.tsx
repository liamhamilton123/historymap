import { useState } from 'react';
import { useMapStore } from '~/lib/store';

type MapControlsProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn: boolean;
};

const buttonClass =
  'flex cursor-pointer items-center gap-1.5 rounded-[7px] px-2 py-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent';

export default function MapControls({ onZoomIn, onZoomOut, canZoomIn }: MapControlsProps) {
  const globe = useMapStore((state) => state.globe);
  const setGlobe = useMapStore((state) => state.setGlobe);
  const historicalThemes = useMapStore((state) => state.historicalThemes);
  const setHistoricalThemes = useMapStore((state) => state.setHistoricalThemes);
  const [showAttribution, setShowAttribution] = useState(false);

  return (
    <div className="map-control-panel absolute top-4 right-4 z-[5] w-[148px] rounded-xl border border-ink/12 bg-panel/55 p-2 shadow-panel backdrop-blur-[8px] backdrop-saturate-[140%]">
      <p className="px-1 pt-0.5 pb-1.5 text-center text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">Projection</p>
      <div className="mx-auto grid w-[86px] gap-0.5 rounded-lg bg-ink/4 p-0.5" role="group" aria-label="Map projection">
        <button
          className={`${buttonClass} ${!globe ? 'bg-accent text-ocean-deep shadow-sm' : 'text-ink-dim hover:bg-ink/8 hover:text-ink'}`}
          onClick={() => setGlobe(false)}
          aria-pressed={!globe}
        >
          <FlatIcon />
          Flat
        </button>
        <button
          className={`${buttonClass} ${globe ? 'bg-accent text-ocean-deep shadow-sm' : 'text-ink-dim hover:bg-ink/8 hover:text-ink'}`}
          onClick={() => setGlobe(true)}
          aria-pressed={globe}
        >
          <GlobeIcon />
          Globe
        </button>
      </div>

      <div className="mt-2 border-t border-ink/12 pt-2">
        <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[11px] text-ink-dim transition-colors hover:bg-ink/6 hover:text-ink">
          <span>Historical themes</span>
          <input
            className="size-3.5 accent-accent"
            type="checkbox"
            checked={historicalThemes}
            onChange={(event) => setHistoricalThemes(event.target.checked)}
          />
        </label>
      </div>

      <div className="mt-2 flex flex-col items-center border-t border-ink/12 pt-2">
        <span className="mb-1.5 text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">Zoom</span>
        <div className="flex flex-col overflow-hidden rounded-[9px] border border-ink/12 bg-ink/4">
          <button className="grid size-[34px] cursor-pointer place-items-center border-b border-ink/12 text-lg leading-none text-ink-dim transition-colors hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent" onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in" title={canZoomIn ? 'Zoom in' : 'Maximum zoom: 750 km view'}>
            +
          </button>
          <button className="grid size-[34px] cursor-pointer place-items-center text-lg leading-none text-ink-dim transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
            −
          </button>
        </div>
      </div>
      <div className="relative mt-2 flex justify-center border-t border-ink/12 pt-2">
        {showAttribution && (
          <div className="absolute top-0 right-[calc(100%+10px)] w-52 rounded-lg border border-ink/12 bg-panel px-3 py-2 text-xs leading-relaxed text-ink-dim shadow-panel">
            Map rendering by <a href="https://maplibre.org/" target="_blank" rel="noreferrer">MapLibre</a>. Physical data © <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>.
          </div>
        )}
        <button
          className="grid size-7 cursor-pointer place-items-center rounded-full border border-ink/12 text-xs font-medium text-ink-faint transition-colors hover:bg-ink/6 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          type="button"
          onClick={() => setShowAttribution((visible) => !visible)}
          aria-label="Map information and attribution"
          aria-expanded={showAttribution}
          title="Map information"
        >
          i
        </button>
      </div>
    </div>
  );
}

function FlatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
      <path d="M2.2 3.2h11.6v9.6H2.2z" />
      <path d="m2.5 11.4 3.2-3 2.3 1.8 2.3-3.2 3.2 3.1" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" />
      <ellipse cx="8" cy="8" rx="2.6" ry="6.2" />
      <path d="M1.9 8h12.2" />
    </svg>
  );
}
