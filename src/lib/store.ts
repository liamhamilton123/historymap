import { create } from 'zustand';

type MapState = {
  year: number;
  globe: boolean;
  setYear: (year: number) => void;
  setGlobe: (globe: boolean) => void;
  toggleGlobe: () => void;
};

export const useMapStore = create<MapState>((set) => ({
  year: 1980,
  globe: false,
  setYear: (year) => set({ year }),
  setGlobe: (globe) => set({ globe }),
  toggleGlobe: () => set((state) => ({ globe: !state.globe })),
}));
