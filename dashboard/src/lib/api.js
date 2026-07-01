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
  getRiders:        ()         => api.get('/admin/riders'),
  getMyDeliveries:  ()         => api.get('/rider/deliveries'),
  acceptDelivery:   (id)       => api.post(`/rider/deliveries/${id}/accept`),
  markPickup:       (id)       => api.post(`/rider/deliveries/${id}/pickup`),
  markDelivered:    (id)       => api.post(`/rider/deliveries/${id}/deliver`),
};

// ── Analytics (summary) ───────────────────────────────────────
export const analyticsApi = {
  getOverview: () => api.get('/admin/analytics/overview'),
};
