import { create } from 'zustand';

type MapState = {
  year: number;
  playing: boolean;
  globe: boolean;
  setYear: (year: number) => void;
  togglePlaying: () => void;
  setPlaying: (playing: boolean) => void;
  setGlobe: (globe: boolean) => void;
  toggleGlobe: () => void;
};

export const useMapStore = create<MapState>((set) => ({
  year: 1400,
  playing: false,
  globe: false,
  setYear: (year) => set({ year }),
  togglePlaying: () => set((state) => ({ playing: !state.playing })),
  setPlaying: (playing) => set({ playing }),
  setGlobe: (globe) => set({ globe }),
  toggleGlobe: () => set((state) => ({ globe: !state.globe })),
}));
