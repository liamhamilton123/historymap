import { create } from 'zustand';

type MapState = {
  /** The instant the map is showing, as a decimal year. See lib/time.ts. */
  t: number;
  globe: boolean;
  setT: (t: number) => void;
  setGlobe: (globe: boolean) => void;
  toggleGlobe: () => void;
};

export const useMapStore = create<MapState>((set) => ({
  t: 1980,
  globe: false,
  setT: (t) => set({ t }),
  setGlobe: (globe) => set({ globe }),
  toggleGlobe: () => set((state) => ({ globe: !state.globe })),
}));
