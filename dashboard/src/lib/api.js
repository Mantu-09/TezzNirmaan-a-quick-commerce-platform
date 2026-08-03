/**
 * API client for TezzNirmaan dashboard.
 * Reads auth token from cookies and attaches to every request.
 * All endpoints call the backend Express API via Next.js rewrite proxy.
 */
import Cookies from 'js-cookie';

const BASE = '/api/backend';

/** Build query string, omitting undefined/null values */
function qs(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const str = new URLSearchParams(clean).toString();
  return str ? `?${str}` : '';
}

let _isRefreshing = false;
let _refreshQueue = [];

async function refreshAccessToken() {
  const refreshToken = Cookies.get('tn_refresh');
  if (!refreshToken) throw new Error('No refresh token');

  const res = await fetch(`${BASE}/auth/refresh`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refresh_token: refreshToken }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Refresh failed');

  const { access_token, refresh_token: newRefresh } = json.data?.session || {};
  if (access_token) {
    Cookies.set('tn_token',   access_token, { expires: 7, sameSite: 'strict' });
  }
  if (newRefresh) {
    Cookies.set('tn_refresh', newRefresh,   { expires: 30, sameSite: 'strict' });
  }
  return access_token;
}

async function request(method, path, data = null, _retry = false) {
  const token  = Cookies.get('tn_token');
  const shopId = Cookies.get('tn_shop_id');

  const headers = {
    'Content-Type': 'application/json',
    ...(token  && { Authorization: `Bearer ${token}` }),
    ...(shopId && { 'X-Shop-Id': shopId }),
  };

  const init = {
    method,
    headers,
    credentials: 'include',
    ...(data && { body: JSON.stringify(data) }),
  };

  const res  = await fetch(`${BASE}${path}`, init);
  const json = await res.json().catch(() => ({}));

  // ── Auto-refresh on 401 (token expired) ──────────────────────
  if (res.status === 401 && !_retry) {
    if (!_isRefreshing) {
      _isRefreshing = true;
      try {
        await refreshAccessToken();
        _refreshQueue.forEach(r => r());
      } catch {
        _refreshQueue.forEach(r => r(new Error('Session expired')));
        Cookies.remove('tn_token');
        Cookies.remove('tn_refresh');
        Cookies.remove('tn_shop_id');
        if (typeof window !== 'undefined') window.location.href = '/login';
        throw new Error('Session expired — please log in again');
      } finally {
        _isRefreshing = false;
        _refreshQueue = [];
      }
    } else {
      // Queue concurrent requests while refresh is in-flight
      await new Promise((resolve, reject) =>
        _refreshQueue.push(err => err ? reject(err) : resolve())
      );
    }
    // Retry with new token
    return request(method, path, data, true);
  }

  if (!res.ok) {
    const error = new Error(json.message || json.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.data   = json;
    throw error;
  }

  return json;
}

export const api = {
  get:    (path)         => request('GET',    path),
  post:   (path, data)   => request('POST',   path, data),
  patch:  (path, data)   => request('PATCH',  path, data),
  put:    (path, data)   => request('PUT',    path, data),
  delete: (path)         => request('DELETE', path),
};

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  // Staff (shop_owner / rider / platform_admin) — phone + password
  staffLogin: (phone, password)  => api.post('/auth/staff/login', { phone, password }),
  // Customer OTP (mobile app only)
  requestOtp: (phone)            => api.post('/auth/otp/request', { phone }),
  verifyOtp:  (phone, otp)       => api.post('/auth/otp/verify',  { phone, otp }),
  getProfile: ()                 => api.get('/profile'),
};

// ── Shop Orders ───────────────────────────────────────────────
export const ordersApi = {
  getShopOrders:   (params = {}) => api.get(`/shop/orders${qs(params)}`),
  getSubOrder:     (id)          => api.get(`/shop/orders/${id}`),
  confirmOrder:    (id)          => api.post(`/shop/orders/${id}/confirm`),
  rejectOrder:     (id, reason)  => api.post(`/shop/orders/${id}/reject`, { reason }),
  markPreparing:   (id)          => api.post(`/shop/orders/${id}/preparing`),
  markReady:       (id)          => api.post(`/shop/orders/${id}/ready`),
  assignRider:     (id, riderId) => api.post(`/shop/orders/${id}/assign-rider`, { rider_id: riderId }),

  // P5-5C: CSV export — returns a URL string for browser download
  // Uses window.open() rather than fetch() so the browser saves the file.
  exportCsvUrl:    (from, to)    => {
    const token  = typeof window !== 'undefined' ? document.cookie.match(/tn_token=([^;]+)/)?.[1] : '';
    const shopId = typeof window !== 'undefined' ? document.cookie.match(/tn_shop_id=([^;]+)/)?.[1] : '';
    return `${BASE}/shop/orders/export${qs({ from, to, format: 'csv' })}`;
  },
};

// ── Inventory ─────────────────────────────────────────────────
export const inventoryApi = {
  getInventory:       (params = {}) => api.get(`/shop/inventory${qs(params)}`),
  updateItem:         (id, data)    => api.patch(`/shop/inventory/${id}`, data),
  addItem:            (data)        => api.post('/shop/inventory', data),
  bulkUpdate:         (items)       => api.patch('/shop/inventory/bulk-update', { items }),
  removeItem:         (id)          => api.delete(`/shop/inventory/${id}`),

  // P1-D: CSV bulk upload — sends multipart/form-data, NOT JSON
  bulkUpload: async (file) => {
    const token  = Cookies.get('tn_token');
    const shopId = Cookies.get('tn_shop_id');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/shop/inventory/bulk-upload`, {
      method: 'POST',
      headers: {
        ...(token  && { Authorization: `Bearer ${token}` }),
        ...(shopId && { 'X-Shop-Id': shopId }),
        // Note: do NOT set Content-Type here — browser sets it with boundary
      },
      credentials: 'include',
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(json.message || json.error || `HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return json;
  },

  // P1-D: Download CSV template
  downloadTemplate: () => `${BASE}/shop/inventory/bulk-template`,

  // P7-5: Get presigned R2 upload URL for product images
  getImageUploadUrl: (folder = 'products', contentType = 'image/jpeg') =>
    api.post('/shop/images/upload-url', { folder, content_type: contentType }),
};

// ── Shop Settings ─────────────────────────────────────────────
export const shopApi = {
  getSettings:    () => api.get('/shop/settings'),
  updateSettings: (data) => api.patch('/shop/settings', data),
  toggleOrders:   (accepting) => api.post('/shop/settings/toggle-orders', { is_accepting_orders: accepting }),
};

// ── Riders (for assignment) ───────────────────────────────────
export const riderApi = {
  // Uses /shop/riders (shop-scoped) instead of /admin/riders (requires platform_admin).
  // Returns only riders assigned to the authenticated shop owner's shop.
  getRiders:        ()         => api.get('/shop/riders'),
  getMyDeliveries:  ()         => api.get('/rider/deliveries'),
  acceptDelivery:   (id)       => api.post(`/rider/deliveries/${id}/accept`),
  markPickup:       (id)       => api.post(`/rider/deliveries/${id}/pickup`),
  markDelivered:    (id)       => api.post(`/rider/deliveries/${id}/deliver`),
};

// ── Analytics ─────────────────────────────────────────────────
export const analyticsApi = {
  getOverview:            ()               => api.get('/admin/analytics/overview'),
  getShopAnalytics:       (period = '7d')  => api.get(`/shop/analytics?period=${period}`),  // B5
  getPlatformAnalytics:   (period = '30d') => api.get(`/admin/analytics/platform?period=${period}`), // P2-A
};

// ── Notifications (B1) ───────────────────────────────────────
export const notificationApi = {
  getAll:       (page = 1) => api.get(`/notifications?page=${page}&limit=20`),
  markRead:     (ids)      => api.post('/notifications/mark-read', { ids }),
  markAllRead:  ()         => api.post('/notifications/mark-all-read'),
};

// ── Admin (B2) ───────────────────────────────────────────────
export const adminApi = {
  // Shops
  getShops:       (params = '') => api.get(`/admin/shops${params ? `?${params}` : ''}`),
  getShop:        (id)          => api.get(`/admin/shops/${id}`),
  createShop:     (body)        => api.post('/admin/shops', body),
  updateShop:     (id, body)    => api.patch(`/admin/shops/${id}`, body),
  toggleShop:     (id, active)  => api.patch(`/admin/shops/${id}/status`, { is_active: active }),

  // Riders
  getRiders:      (params = '') => api.get(`/admin/riders${params ? `?${params}` : ''}`),
  createRider:    (body)        => api.post('/admin/riders', body),
  updateRider:    (id, body)    => api.patch(`/admin/riders/${id}`, body),
  assignRider:    (id, shopIds) => api.post(`/admin/riders/${id}/assign`, { shop_ids: shopIds }),

  // Analytics
  getOverview:    ()            => api.get('/admin/analytics/overview'),
};

// ── Reviews (B4) ─────────────────────────────────────────────
export const reviewsApi = {
  getSummary:  ()              => api.get('/shop/ratings/summary'),
  getRatings:  (page = 1)      => api.get(`/shop/ratings?page=${page}&limit=20`),
  flagRating:  (id, flagged)   => api.patch(`/shop/ratings/${id}/flag`, { flagged }),
};

// ── Delivery Slots (B6) ───────────────────────────────────────
export const slotsApi = {
  // Shop-owner: template management
  getTemplates:   ()                => api.get('/shop/slots/templates'),
  createTemplate: (body)            => api.post('/shop/slots/templates', body),
  updateTemplate: (id, body)        => api.patch(`/shop/slots/templates/${id}`, body),
  deleteTemplate: (id)              => api.delete(`/shop/slots/templates/${id}`),
  seedDefaults:   ()                => api.post('/shop/slots/templates/seed-defaults'),

  // Shop-owner: day view of bookings
  getBookings:    (date)            => api.get(`/shop/slots/bookings?date=${date}`),
};

// ── AI Intelligence (P5-2) ────────────────────────────────────
export const aiApi = {
  // GET /shop/demand-forecast?days=7 — owner-only, 30-min cache
  getDemandForecast: (days = 7) => api.get(`/shop/demand-forecast?days=${days}`),
};

// ── P6-3: Returns ─────────────────────────────────────────────
export const returnsApi = {
  /** List return requests for the authenticated shop. */
  getReturns: (params = {}) => api.get(`/shop/returns${qs(params)}`),

  /** Get a single return request detail. */
  getReturn: (id) => api.get(`/shop/returns/${id}`),

  /**
   * Approve a return and initiate a refund.
   * @param {string} id
   * @param {{ refundAmountPaise: number, refundMethod: 'wallet'|'original_payment_method' }} body
   */
  approve: (id, body) => api.patch(`/shop/returns/${id}/approve`, body),

  /**
   * Reject a return with a reason.
   * @param {string} id
   * @param {{ rejectionReason: string }} body
   */
  reject: (id, body) => api.patch(`/shop/returns/${id}/reject`, body),
};

// ─────────────────────────────────────────────────────────────────────────────
// P7-4: Freshchat REST API — read-only, for Support Inbox badge count only.
//
// The token is a Freshchat API token (not the user's JWT).
// Get it: Freshchat dashboard → Settings → API → Create token.
// Set FRESHCHAT_API_TOKEN in dashboard environment variables.
//
// IMPORTANT: This is a server-side token. Do NOT expose it client-side in
// production. For Next.js, move this call to a /api/support-count route.
// ─────────────────────────────────────────────────────────────────────────────
export const supportApi = {
  /**
   * Fetch the count of open (unresolved) conversations from Freshchat.
   * Returns 0 if the API token is not configured or the call fails.
   *
   * @returns {Promise<number>}
   */
  getUnreadCount: async () => {
    const token = process.env.FRESHCHAT_API_TOKEN ||
                  process.env.NEXT_PUBLIC_FRESHCHAT_API_TOKEN;
    if (!token) return 0;

    try {
      const res = await fetch(
        'https://api.freshchat.com/v2/conversations?status=open&per_page=1',
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          // Cache for 60s to avoid hammering the Freshchat API on every page load
          next: { revalidate: 60 },
        }
      );
      if (!res.ok) return 0;
      const data = await res.json();
      return data?.meta?.total_count || 0;
    } catch {
      return 0;
    }
  },
};

// ── Job Queue / DLQ — P7-7 ────────────────────────────────────
export const jobsApi = {
  // GET /admin/jobs/failed?queue=send-notification&page=1&limit=20
  getFailedJobs: (params = {}) => api.get(`/admin/jobs/failed${qs(params)}`),
  // POST /admin/jobs/:jobId/retry
  retryJob:      (jobId)       => api.post(`/admin/jobs/${jobId}/retry`),
  // POST /admin/jobs/retry-all  { queue }
  retryAll:      (queue)       => api.post('/admin/jobs/retry-all', { queue }),
  // DELETE /admin/jobs/:jobId
  discardJob:    (jobId)       => api.delete(`/admin/jobs/${jobId}`),
};

// ── Push Campaigns — P8-3 ─────────────────────────────────────
export const campaignsApi = {
  // GET  /admin/campaigns?status=draft|scheduled|sent&page=1&limit=20
  list:     (params = {})        => api.get(`/admin/campaigns${qs(params)}`),
  // POST /admin/campaigns  { title, body, audience, ... }
  create:   (data)               => api.post('/admin/campaigns', data),
  // GET  /admin/campaigns/:id
  get:      (id)                 => api.get(`/admin/campaigns/${id}`),
  // PATCH /admin/campaigns/:id
  update:   (id, data)           => api.patch(`/admin/campaigns/${id}`, data),
  // GET  /admin/campaigns/preview?audience=all_customers&city_id=<uuid>
  preview:  (audience, city_id)  => api.get(`/admin/campaigns/preview${qs({ audience, city_id })}`),
  // POST /admin/campaigns/:id/schedule  { scheduled_at }
  schedule: (id, scheduled_at)   => api.post(`/admin/campaigns/${id}/schedule`, { scheduled_at }),
  // POST /admin/campaigns/:id/send-now  → 202 Accepted
  sendNow:  (id)                 => api.post(`/admin/campaigns/${id}/send-now`),
  // POST /admin/campaigns/:id/cancel
  cancel:   (id)                 => api.post(`/admin/campaigns/${id}/cancel`),
};

// ── Live Analytics — P9-3 ──────────────────────────────────────
// GET /admin/analytics/live — founder real-time dashboard
// Always bypasses browser cache (the endpoint sets no-store too).
export const liveAnalyticsApi = {
  getLive: () => api.get('/admin/analytics/live'),
};

