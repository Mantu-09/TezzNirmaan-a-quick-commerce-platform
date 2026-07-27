import client from './client';

// ── Cart ─────────────────────────────────────────────────────

export async function getCart() {
  return client.get('/cart');
}

export async function addToCart(shopId, productId, quantity) {
  return client.post('/cart/items', { shopId, productId, quantity });
}

export async function updateCartItem(itemId, quantity) {
  return client.patch(`/cart/items/${itemId}`, { quantity });
}

export async function removeCartItem(itemId) {
  return client.delete(`/cart/items/${itemId}`);
}

export async function clearCart() {
  return client.delete('/cart');
}

// ── Checkout ─────────────────────────────────────────────────

export async function previewOrder(addressId) {
  return client.post('/orders/preview', { addressId });
}

/**
 * @param {{ addressId, paymentMethod, notes?, scheduledSlot? }} payload
 */
export async function placeOrder(payload) {
  return client.post('/orders', payload);
}

// ── P4-3B: Basket (multi-shop) ───────────────────────────────

/** Preview a multi-shop basket — returns per-shop breakdown */
export async function previewBasket(addressId) {
  return client.post('/orders/basket/preview', { addressId });
}

/**
 * Place a multi-shop basket order.
 * @param {{ addressId, paymentMethod, notes?, promoCode? }} payload
 */
export async function placeBasketOrder(payload) {
  return client.post('/orders/basket', payload);
}

/** Get basket detail (basket record + all child orders) */
export async function getBasket(basketId) {
  return client.get(`/orders/baskets/${basketId}`);
}


// ── Orders ───────────────────────────────────────────────────

export async function getOrders(page = 1) {
  return client.get('/orders', { params: { page, limit: 20 } });
}

export async function getOrder(orderId) {
  return client.get(`/orders/${orderId}`);
}

export async function cancelOrder(orderId, reason) {
  return client.post(`/orders/${orderId}/cancel`, { reason });
}

/** P2-D: Clears cart and repopulates with available items from a past order */
export async function reorder(orderId) {
  return client.post(`/orders/${orderId}/reorder`);
}

// P1-C: Validate a promo code before checkout
export async function validatePromo(code, orderAmountPaise, tier = null) {
  return client.post('/promos/validate', { code, order_amount_paise: orderAmountPaise, tier });
}

// ── Addresses ────────────────────────────────────────────────

export async function getAddresses() {
  return client.get('/addresses');
}

export async function createAddress(data) {
  return client.post('/addresses', data);
}

export async function updateAddress(id, data) {
  return client.patch(`/addresses/${id}`, data);
}

export async function deleteAddress(id) {
  return client.delete(`/addresses/${id}`);
}

// ── Profile ──────────────────────────────────────────────────

export async function getProfile() {
  return client.get('/profile');
}

export async function updateProfile(data) {
  return client.patch('/profile', data);
}

// ── Payments ─────────────────────────────────────────────────

export async function createRazorpayOrder(orderId) {
  return client.post('/payments/create-razorpay-order', { orderId });
}

export async function verifyPayment(payload) {
  return client.post('/payments/verify', payload);
}
