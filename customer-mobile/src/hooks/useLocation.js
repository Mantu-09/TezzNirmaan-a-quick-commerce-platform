/**
 * useLocation.js — Session K extended
 *
 * Returns:
 *   locality        — human-readable string (e.g. "Kankarbagh, Patna")
 *   coords          — { latitude, longitude } | null
 *   isLoading       — true while detecting
 *   serviceability  — { serviceable, city, active_shop_count, reason } | null
 *
 * Backwards-compatible: callers that only use { locality, isLoading } unchanged.
 */

import { useState, useEffect }     from 'react';
import useCityStore                from '../store/cityStore';
import { checkServiceability }     from '../api/cities';

let ExpoLocation = null;
try {
  ExpoLocation = require('expo-location');
} catch (_) {}

export default function useLocation() {
  const { selectedCity } = useCityStore();
  const [locality,       setLocality]       = useState(selectedCity?.name || 'Nearby');
  const [coords,         setCoords]         = useState(null);
  const [serviceability, setServiceability] = useState(null);
  const [isLoading,      setIsLoading]      = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      setIsLoading(true);
      try {
        if (!ExpoLocation) throw new Error('expo-location not available');

        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('Permission denied');

        const loc = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });

        const { latitude, longitude } = loc.coords;

        if (cancelled) return;
        setCoords({ latitude, longitude });

        // Reverse geocode for human-readable locality
        try {
          const [address] = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
          if (!cancelled) {
            const parts = [
              address?.district || address?.subregion,
              address?.city || selectedCity?.name,
            ].filter(Boolean);
            setLocality(parts.length ? parts.join(', ') : (selectedCity?.name || 'Nearby'));
          }
        } catch (_) {
          if (!cancelled) setLocality(selectedCity?.name || 'Nearby');
        }

        // Session K: serviceability check (fire-and-forget, non-fatal)
        try {
          const result = await checkServiceability(latitude, longitude);
          if (!cancelled) setServiceability(result);
        } catch (_) {
          // Serviceability check failing is non-fatal — app still works
        }

      } catch (_) {
        if (!cancelled) {
          setLocality(selectedCity?.name || 'Nearby');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    detect();
    return () => { cancelled = true; };
  }, [selectedCity?.name]);

  return { locality, coords, serviceability, isLoading };
}

