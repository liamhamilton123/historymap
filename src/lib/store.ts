import { create } from 'zustand';

type MapState = {
  /** The instant the map is showing, as a decimal year. See lib/time.ts. */
  t: number;
  globe: boolean;
  /** Whether the physical basemap palette follows the selected historical era. */
  historicalThemes: boolean;
  setT: (t: number) => void;
  setGlobe: (globe: boolean) => void;
  toggleGlobe: () => void;
  setHistoricalThemes: (historicalThemes: boolean) => void;
};

export const useMapStore = create<MapState>((set) => ({
  t: 1980,
  globe: false,
  historicalThemes: true,
  setT: (t) => set({ t }),
  setGlobe: (globe) => set({ globe }),
  toggleGlobe: () => set((state) => ({ globe: !state.globe })),
  setHistoricalThemes: (historicalThemes) => set({ historicalThemes }),
}));
