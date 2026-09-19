// ────────────────────────────────────────────────────────────
// City Store — P4-4A
//
// Zustand store for the user's selected city.
// Persisted to AsyncStorage so the selection survives app restarts.
//
// Usage:
//   const { selectedCity, setCity } = useCityStore();
//
// The selected city provides:
//   { id, name, center_lat, center_lng, is_active, ... }
// ────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const useCityStore = create(
  persist(
    (set) => ({
      /**
       * The city the user has selected.
       * null = no city selected yet → show CitySelectScreen.
       * @type {null | { id: string, name: string, state: string, center_lat: number, center_lng: number, is_active: boolean, launch_date: string|null }}
       */
      selectedCity: null,

      /**
       * Set the selected city (called from CitySelectScreen or after
       * location auto-detection resolves to an active city).
       */
      setCity: (city) => set({ selectedCity: city }),

      /**
       * Clear city selection (allows user to change city).
       */
      clearCity: () => set({ selectedCity: null }),
    }),
    {
      name:    'tezznirmaan-city',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useCityStore;
