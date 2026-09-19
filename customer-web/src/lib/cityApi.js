// ────────────────────────────────────────────────────────────
// City API — Admin Dashboard (P4-4A)
//
// Wraps backend city management endpoints.
// All calls require an authenticated admin session (cookie
// forwarded automatically by Next.js API client).
// ────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

async function adminFetch(path, opts = {}) {
  const token =
    typeof window !== 'undefined'
      ? (document.cookie.match(/(?:^|; )auth_token=([^;]*)/) || [])[1]
      : null;

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${decodeURIComponent(token)}` } : {}),
    },
    ...opts,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json?.data ?? json;
}

/**
 * GET /admin/cities
 * Returns cities with shop_count, order_count, gmv_paise, waitlist_count.
 */
export async function fetchCities() {
  return adminFetch('/admin/cities');
}

/**
 * GET /admin/cities/:cityId
 * Returns city + analytics (top_shops, gmv, avg_delivery_time_mins).
 */
export async function fetchCityAnalytics(cityId) {
  return adminFetch(`/admin/cities/${cityId}`);
}

/**
 * PATCH /admin/cities/:cityId/status
 * @param {string} cityId
 * @param {boolean} isActive
 */
export async function toggleCity(cityId, isActive) {
  return adminFetch(`/admin/cities/${cityId}/status`, {
    method: 'PATCH',
    body:   JSON.stringify({ is_active: isActive }),
  });
}

/**
 * POST /admin/cities/:cityId/activate
 * Convenience: always activates + triggers webhook notification.
 */
export async function activateCity(cityId) {
  return adminFetch(`/admin/cities/${cityId}/activate`, { method: 'POST' });
}
