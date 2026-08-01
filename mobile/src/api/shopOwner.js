// ────────────────────────────────────────────────────────────
// Shop Owner API Module — P8-4
//
// Covers all shop-side endpoints used by the mobile app:
//   • Queue management (accept, reject, status transitions)
//   • Inventory listing + stock update
//   • Sub-order detail
// ────────────────────────────────────────────────────────────
import client from './client';

// ── Order Queue ───────────────────────────────────────────────

/**
 * GET /shop/orders?status=new,confirmed,preparing&limit=50
 * Returns sub-orders the shop needs to action.
 */
export async function getShopOrderQueue(params = {}) {
  return client.get('/shop/orders', { params });
}

/**
 * GET /shop/orders/:subOrderId
 * Full sub-order detail including items, address, customer phone.
 */
export async function getShopSubOrder(subOrderId) {
  return client.get(`/shop/orders/${subOrderId}`);
}

/**
 * POST /shop/orders/:subOrderId/confirm
 * Accept / confirm a new order.
 */
export async function confirmShopOrder(subOrderId) {
  return client.post(`/shop/orders/${subOrderId}/confirm`);
}

/**
 * POST /shop/orders/:subOrderId/reject
 * @param {{ reason: string }} payload
 */
export async function rejectShopOrder(subOrderId, reason) {
  return client.post(`/shop/orders/${subOrderId}/reject`, { reason });
}

/**
 * POST /shop/orders/:subOrderId/preparing
 * Move a confirmed order to "preparing".
 */
export async function startPreparing(subOrderId) {
  return client.post(`/shop/orders/${subOrderId}/preparing`);
}

/**
 * POST /shop/orders/:subOrderId/ready
 * Mark an order ready for pickup by the rider.
 */
export async function markReady(subOrderId) {
  return client.post(`/shop/orders/${subOrderId}/ready`);
}

// ── Inventory ─────────────────────────────────────────────────

/**
 * GET /shop/inventory?page=1&limit=50&lowStock=true
 */
export async function getShopInventory(params = {}) {
  return client.get('/shop/inventory', { params });
}

/**
 * PATCH /shop/inventory/:itemId
 * Quick stock update or full item edit.
 * @param {{ stock_count?, price_paise?, is_available?, low_stock_threshold? }} data
 */
export async function updateInventoryItem(itemId, data) {
  return client.patch(`/shop/inventory/${itemId}`, data);
}
