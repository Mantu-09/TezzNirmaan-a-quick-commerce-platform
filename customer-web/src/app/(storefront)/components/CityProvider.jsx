// ─────────────────────────────────────────────────────────────
// CityProvider.jsx — P10-0
//
// Client component. Holds the currently-selected city (slug + name)
// and exposes it via CityContext to all child components.
//
// The `initialCity` prop is provided by the server-component layout
// (read from the tn_city cookie). Changes here are client-side only
// (useful for a future city picker modal).
// ─────────────────────────────────────────────────────────────
'use client';
import React, { createContext, useContext, useState } from 'react';

const CityContext = createContext(null);

// Human-readable labels for known city slugs
const CITY_LABELS = {
  patna:       'Patna',
  muzaffarpur: 'Muzaffarpur',
  bhagalpur:   'Bhagalpur',
  gaya:        'Gaya',
};

export default function CityProvider({ children, initialCity = 'patna' }) {
  const [citySlug, setCitySlug] = useState(initialCity);

  const cityName = CITY_LABELS[citySlug]
    ?? (citySlug.charAt(0).toUpperCase() + citySlug.slice(1));

  return (
    <CityContext.Provider value={{ citySlug, cityName, setCitySlug }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCity() {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error('useCity must be used within CityProvider');
  return ctx;
}
