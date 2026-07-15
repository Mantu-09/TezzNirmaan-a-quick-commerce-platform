/**
 * API client for TezzNirmaan dashboard.
 * Reads auth token from cookies and attaches to every request.
 * All endpoints call the backend Express API via Next.js rewrite proxy.
 */
import Cookies from 'js-cookie';

const BASE = '/api/backend';

async function request(method, path, data = null) {
  const token = Cookies.get('tn_token');
  const shopId = Cookies.get('tn_shop_id');

  const headers = {
    'Content-Type': 'application/json',
    ...(token   && { Authorization: `Bearer ${token}` }),
    ...(shopId  && { 'X-Shop-Id': shopId }),
  };

  const init = {
    method,
    headers,
    credentials: 'include',
    ...(data && { body: JSON.stringify(data) }),
  };

  const res = await fetch(`${BASE}${path}`, init);
  const json = await res.json().catch(() => ({}));

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
  requestOtp: (phone)        => api.post('/auth/otp/request', { phone }),
  verifyOtp:  (phone, otp)   => api.post('/auth/otp/verify',  { phone, otp }),
  getProfile: ()             => api.get('/profile'),
};

// ── Shop Orders ───────────────────────────────────────────────
export const ordersApi = {
  getShopOrders:   (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/shop/orders${qs ? `?${qs}` : ''}`);
  },
  getSubOrder:     (id)          => api.get(`/shop/orders/${id}`),
  confirmOrder:    (id)          => api.post(`/shop/orders/${id}/confirm`),
  rejectOrder:     (id, reason)  => api.post(`/shop/orders/${id}/reject`, { reason }),
  markPreparing:   (id)          => api.post(`/shop/orders/${id}/preparing`),
  markReady:       (id)          => api.post(`/shop/orders/${id}/ready`),
  assignRider:     (id, riderId) => api.post(`/shop/orders/${id}/assign-rider`, { rider_id: riderId }),
};

// ── Inventory ─────────────────────────────────────────────────
export const inventoryApi = {
  getInventory:       (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/shop/inventory${qs ? `?${qs}` : ''}`);
  },
  updateItem:         (id, data)    => api.patch(`/shop/inventory/${id}`, data),
  addItem:            (data)        => api.post('/shop/inventory', data),
  bulkUpdate:         (items)       => api.patch('/shop/inventory/bulk-update', { items }),
  removeItem:         (id)          => api.delete(`/shop/inventory/${id}`),
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
  getOverview:        ()               => api.get('/admin/analytics/overview'),
  getShopAnalytics:   (period = '7d')  => api.get(`/shop/analytics?period=${period}`),  // B5
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

