import { useMapStore } from '~/lib/store';

export default function MapControls() {
  const globe = useMapStore((state) => state.globe);
  const toggleGlobe = useMapStore((state) => state.toggleGlobe);

  return (
    <div className="map-controls panel">
      <button
        className="icon-button"
        onClick={toggleGlobe}
        aria-pressed={globe}
        title="Toggle globe projection"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <ellipse cx="8" cy="8" rx="2.6" ry="6.2" />
          <path d="M1.9 8h12.2" />
        </svg>
        <span className="visually-hidden">Toggle globe projection</span>
      </button>
    </div>
  );
}
