// ────────────────────────────────────────────────────────────
// useRiderLocations.js — Phase F Real-time Rider Locations
//
// Fetches all online riders' latest GPS positions and subscribes
// to Supabase real-time changes on rider_locations table.
//
// Returns:
//   { riders, loading, error, refresh }
//
// Each rider object:
//   { id, full_name, phone, lat, lng, is_online, updated_at,
//     has_active_delivery, delivery_id }
//
// Usage (admin live page):
//   const { riders } = useRiderLocations();
// ────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

const POLL_MS = 15_000; // fallback polling every 15 s if realtime fails

export default function useRiderLocations() {
  const [riders,  setRiders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const pollRef   = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/riders/locations');
      const data = res?.data?.riders || [];
      setRiders(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load rider locations');
    } finally {
      setLoading(false);
    }
  }, []);

  // Merge a single updated rider without re-fetching all
  const updateRider = useCallback((update) => {
    setRiders(prev => {
      const idx = prev.findIndex(r => r.id === update.id);
      if (idx === -1) return [...prev, update];
      const next = [...prev];
      next[idx] = { ...next[idx], ...update };
      return next;
    });
  }, []);

  useEffect(() => {
    load();

    // Try Supabase real-time via client's supabase-js if available
    let channel = null;
    try {
      // Dynamic import so this hook doesn't break if supabase-js isn't in dashboard deps
      import('@supabase/supabase-js').then(({ createClient }) => {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        );
        channel = supabase
          .channel('rider-locations')
          .on('postgres_changes', {
            event:  '*',
            schema: 'public',
            table:  'rider_locations',
          }, payload => {
            if (payload.new) {
              updateRider({
                id:          payload.new.rider_id,
                lat:         payload.new.lat,
                lng:         payload.new.lng,
                is_online:   payload.new.is_online,
                updated_at:  payload.new.updated_at,
              });
            }
          })
          .subscribe();
      }).catch(() => {
        // Supabase real-time not available — fall through to polling
      });
    } catch (_) { /* silent */ }

    // Fallback: poll every 15s
    pollRef.current = setInterval(load, POLL_MS);

    return () => {
      clearInterval(pollRef.current);
      if (channel) {
        try { channel.unsubscribe(); } catch (_) {}
      }
    };
  }, [load, updateRider]);

  return { riders, loading, error, refresh: load };
}
