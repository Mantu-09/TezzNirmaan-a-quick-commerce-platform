// ────────────────────────────────────────────────────────────
// Order Service — Core Checkout Logic
//
// KEY RULES (non-negotiable per architecture):
//  1. Prices are ALWAYS re-read from DB server-side. Never trust client prices.
//  2. All amounts in PAISE (bigint). No floats.
//  3. Stock decrement is atomic via Postgres stored procedure.
//  4. State machine is enforced for all status transitions.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { assertTransition } from '../utils/stateMachine.js';
import { generateOrderNumber } from '../utils/orderNumber.js';
import { calcLineItem, calcDeliveryFee } from '../utils/money.js';
import { NotFoundError, AppError } from '../utils/errors.js';
import { DELIVERY_TIERS } from '../config/constants.js';
import logger from '../utils/logger.js';

// ────────────────────────────────────────────────────────────
// previewOrder
// Returns a dry-run breakdown without writing to DB.
// Shows the customer what they'll pay before confirming.
// ────────────────────────────────────────────────────────────
export async function previewOrder(userId, addressId) {
  // 1. Fetch cart items with fresh server-side prices
  const { data: cartItems, error: cartErr } = await supabaseAdmin
    .from('cart_items')
    .select(`
      id, quantity, shop_id,
      product:products(
        id, name, delivery_tier, unit, gst_percent,
        images
      ),
      inventory:shop_inventory!inner(
        id, price, is_in_stock, is_listed,
        shop:shops(
          id, name, quick_delivery_radius_km, scheduled_delivery_radius_km,
          is_active, is_accepting_orders
        )
      )
    `)
    .eq('user_id', userId);

  if (cartErr) throw cartErr;
  if (!cartItems || cartItems.length === 0) throw new AppError('Your cart is empty', 400);

  // 2. Validate all items are available
  for (const item of cartItems) {
    if (!item.inventory.is_listed || !item.inventory.is_in_stock) {
      throw new AppError(`"${item.product.name}" is currently out of stock`, 400);
    }
  }

  const shop = cartItems[0].inventory.shop;
  if (!shop.is_active || !shop.is_accepting_orders) {
    throw new AppError('This shop is not accepting orders right now', 400);
  }

  // 3. Validate delivery address belongs to user and fetch its coordinates
  const { data: address, error: addrErr } = await supabaseAdmin
    .from('addresses')
    .select('id, label, full_name, phone, address_line1, city, pincode')
    .eq('id', addressId)
    .eq('user_id', userId)
    .single();

  if (addrErr || !address) throw new NotFoundError('Delivery address not found');

  // 4. Group items by delivery tier and compute totals (server-side prices)
  const tierGroups = { quick: [], scheduled: [] };
  for (const item of cartItems) {
    const tier = item.product.delivery_tier;
    const { subtotalPaise, taxPaise, totalPaise } = calcLineItem(
      item.quantity,
      item.inventory.price,  // server-side price in paise
      item.product.gst_percent
    );
    tierGroups[tier].push({
      productId:       item.product.id,
      inventoryId:     item.inventory.id,
      productName:     item.product.name,
      productImageUrl: item.product.images?.[0] || null,
      unit:            item.product.unit,
      deliveryTier:    tier,
      quantity:        item.quantity,
      unitPricePaise:  item.inventory.price,
      taxPercent:      item.product.gst_percent,
      taxAmountPaise:  taxPaise,
      totalPricePaise: totalPaise,
      subtotalPaise,
    });
  }

  // 5. Calculate per-tier and grand totals
  const summary = {};
  let grandSubtotal = 0, grandDelivery = 0, grandTax = 0, grandTotal = 0;

  for (const [tier, items] of Object.entries(tierGroups)) {
    if (items.length === 0) continue;
    const subtotalPaise  = items.reduce((s, i) => s + i.subtotalPaise, 0);
    const taxPaise       = items.reduce((s, i) => s + i.taxAmountPaise, 0);
    const deliveryFee    = calcDeliveryFee(tier, subtotalPaise);
    const totalPaise     = subtotalPaise + taxPaise + deliveryFee;

    summary[tier] = {
      items,
      subtotalPaise,
      taxPaise,
      deliveryFeePaise: deliveryFee,
      totalPaise,
      estimatedDelivery: tier === 'quick'
        ? new Date(Date.now() + 90 * 60000).toISOString()
        : new Date(Date.now() + 24 * 3600000).toISOString(),
    };

    grandSubtotal += subtotalPaise;
    grandDelivery += deliveryFee;
    grandTax      += taxPaise;
    grandTotal    += totalPaise;
  }

  return {
    shopId:           shop.id,
    shopName:         shop.name,
    address,
    tiers:            summary,
    grandSubtotalPaise:  grandSubtotal,
    grandDeliveryPaise:  grandDelivery,
    grandTaxPaise:       grandTax,
    grandTotalPaise:     grandTotal,
    // Convenience for display
    grandTotalRupees: (grandTotal / 100).toFixed(2),
  };
}

// ────────────────────────────────────────────────────────────
// placeOrder
// The core checkout function.
//
// FLOW:
//   1. Build preview (re-reads prices, validates stock/address)
//   2. Build item payload for the Postgres stored procedure
//   3. Call place_order_atomic (one transaction: stock decrement +
//      order creation + cart clear + notification)
//   4. For UPI/card: create Razorpay order, update payment record
//   5. Return order data
// ────────────────────────────────────────────────────────────
export async function placeOrder(userId, { addressId, paymentMethod, notes, scheduledSlot }) {
  // Step 1: Get a fresh preview — this validates everything and computes server-side totals
  const preview = await previewOrder(userId, addressId);

  // Step 2: Build totals per tier
  const quickTier  = preview.tiers.quick;
  const schedTier  = preview.tiers.scheduled;

  // Step 3: Generate order number
  const orderNumber = await generateOrderNumber();

  // Step 4: Build address snapshot (frozen at order time)
  const { data: address } = await supabaseAdmin
    .from('addresses')
    .select('label, full_name, phone, address_line1, address_line2, landmark, city, state, pincode')
    .eq('id', addressId)
    .single();

  const addressSnapshot = { ...address, id: addressId };

  // Step 5: Flatten items for the stored procedure
  // CRITICAL: unit_price_paise comes from the server-side preview, not the client
  const allItems = [
    ...(quickTier?.items || []),
    ...(schedTier?.items || []),
  ].map(item => ({
    inventory_id:       item.inventoryId,
    product_id:         item.productId,
    product_name:       item.productName,
    product_image_url:  item.productImageUrl,
    unit:               item.unit,
    delivery_tier:      item.deliveryTier,
    quantity:           item.quantity,
    unit_price_paise:   item.unitPricePaise,    // from DB, never from client
    tax_percent:        item.taxPercent,
    tax_amount_paise:   item.taxAmountPaise,
    total_price_paise:  item.totalPricePaise,
  }));

  // Step 6: Determine shopId (all items must be from same shop in V1)
  const { data: cartRow } = await supabaseAdmin
    .from('cart_items')
    .select('shop_id')
    .eq('user_id', userId)
    .limit(1)
    .single();
  const shopId = cartRow?.shop_id;
  if (!shopId) throw new AppError('Cart appears to be empty', 400);

  // Step 7: Call the atomic Postgres function — this is the transaction boundary
  logger.info('Calling place_order_atomic', { userId, orderNumber, totalPaise: preview.grandTotalPaise });

  const { data: result, error: rpcErr } = await supabaseAdmin.rpc('place_order_atomic', {
    p_customer_id:        userId,
    p_shop_id:            shopId,
    p_address_id:         addressId,
    p_address_snapshot:   addressSnapshot,
    p_payment_method:     paymentMethod,
    p_notes:              notes || null,
    p_order_number:       orderNumber,
    p_items:              allItems,
    p_quick_subtotal:     quickTier?.subtotalPaise  || 0,
    p_quick_delivery_fee: quickTier?.deliveryFeePaise || 0,
    p_quick_tax:          quickTier?.taxPaise        || 0,
    p_sched_subtotal:     schedTier?.subtotalPaise   || 0,
    p_sched_delivery_fee: schedTier?.deliveryFeePaise || 0,
    p_sched_tax:          schedTier?.taxPaise         || 0,
    p_sched_slot_start:   scheduledSlot?.start || null,
    p_sched_slot_end:     scheduledSlot?.end   || null,
  });

  if (rpcErr) {
    // Parse user-friendly error messages from the stored procedure
    const msg = rpcErr.message || '';
    if (msg.includes('STOCK_UNAVAILABLE'))   throw new AppError(msg.replace('STOCK_UNAVAILABLE: ', ''), 409);
    if (msg.includes('PRICE_CHANGED'))       throw new AppError(msg.replace('PRICE_CHANGED: ', ''), 409);
    if (msg.includes('PRODUCT_UNAVAILABLE')) throw new AppError(msg.replace('PRODUCT_UNAVAILABLE: ', ''), 409);
    logger.error('place_order_atomic failed', { error: rpcErr.message, userId, orderNumber });
    throw rpcErr;
  }

  const { order_id, order_number, total_amount_paise } = result;

  logger.info('Order placed', { orderId: order_id, orderNumber: order_number, totalPaise: total_amount_paise, userId });

  // Step 8: For online payments (UPI, card etc.) — create Razorpay order
  let razorpayOrderId = null;
  if (['upi', 'card', 'netbanking', 'wallet'].includes(paymentMethod)) {
    try {
      // Import lazily to avoid import at module load time
      const { razorpay } = await import('../config/razorpay.js');
      const rzpOrder = await razorpay.orders.create({
        amount:   total_amount_paise,  // already in paise ✓
        currency: 'INR',
        receipt:  order_number,
        notes:    { order_id },
      });
      razorpayOrderId = rzpOrder.id;

      // Store the Razorpay order ID in the payments table
      await supabaseAdmin
        .from('payments')
        .update({ razorpay_order_id: razorpayOrderId, updated_at: new Date().toISOString() })
        .eq('order_id', order_id)
        .eq('status', 'pending');

      logger.info('Razorpay order created', { razorpayOrderId, orderId: order_id });
    } catch (rzpErr) {
      // Non-fatal for now — order is placed, payment link creation failed
      // The customer can retry via POST /payments/create-razorpay-order
      logger.error('Razorpay order creation failed', { error: rzpErr.message, orderId: order_id });
    }
  }

  return {
    orderId:         order_id,
    orderNumber:     order_number,
    totalPaise:      total_amount_paise,
    totalRupees:     (total_amount_paise / 100).toFixed(2),
    razorpayOrderId,
    razorpayKeyId:   razorpayOrderId ? process.env.RAZORPAY_KEY_ID : null,
    preview,
  };
}

// ────────────────────────────────────────────────────────────
// getOrders — order history for a customer
// ────────────────────────────────────────────────────────────
export async function getOrders(userId, { page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;
  const { data, error, count } = await supabaseAdmin
    .from('orders')
    .select(`
      id, order_number, total_amount, placed_at,
      sub_orders(
        id, sub_order_number, delivery_tier, status, total_amount,
        estimated_delivery_at, delivered_at
      )
    `, { count: 'exact' })
    .eq('customer_id', userId)
    .order('placed_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;
  return { orders: data, pagination: { page: +page, limit: +limit, total: count } };
}

// ────────────────────────────────────────────────────────────
// getOrder — full detail of a single order
// ────────────────────────────────────────────────────────────
export async function getOrder(orderId, userId) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      sub_orders(
        *,
        order_items(*),
        delivery_assignments(
          id, accepted_at, picked_up_at, delivered_at,
          riders(profile_id, vehicle_type, profiles!profile_id(full_name, phone))
        )
      ),
      payments(id, method, status, amount, razorpay_order_id, razorpay_payment_id)
    `)
    .eq('id', orderId)
    .eq('customer_id', userId)
    .single();

  if (error || !data) throw new NotFoundError('Order not found');
  return data;
}

// ────────────────────────────────────────────────────────────
// cancelOrder — customer cancels an order
// ────────────────────────────────────────────────────────────
export async function cancelOrder(orderId, userId, reason) {
  // Fetch order + sub_orders
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, customer_id, sub_orders(id, status)')
    .eq('id', orderId)
    .eq('customer_id', userId)
    .single();

  if (error || !order) throw new NotFoundError('Order not found');

  const now = new Date().toISOString();
  const results = [];

  for (const subOrder of order.sub_orders) {
    // Validate cancellation is allowed by state machine
    assertTransition(subOrder.status, 'cancelled', 'customer');

    // Cancel sub_order
    await supabaseAdmin
      .from('sub_orders')
      .update({ status: 'cancelled', cancelled_at: now, cancellation_reason: reason, updated_at: now })
      .eq('id', subOrder.id);

    // Log status history
    await supabaseAdmin.from('sub_order_status_history').insert({
      sub_order_id: subOrder.id,
      from_status:  subOrder.status,
      to_status:    'cancelled',
      changed_by:   userId,
      notes:        reason,
    });

    // Restore stock for all items in this sub_order
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity, sub_orders!inner(orders!inner(shop_id))')
      .eq('sub_order_id', subOrder.id);

    const shopId = items?.[0]?.sub_orders?.orders?.shop_id;
    if (shopId && items?.length) {
      for (const item of items) {
        await supabaseAdmin
          .from('shop_inventory')
          .update({ stock_quantity: supabaseAdmin.rpc('increment_stock', { amount: item.quantity }), updated_at: now })
          .eq('shop_id', shopId)
          .eq('product_id', item.product_id);
      }
    }

    // Notify customer
    await supabaseAdmin.rpc('notify_user', {
      p_user_id:  userId,
      p_type:     'order_cancelled',
      p_title:    'Order Cancelled',
      p_message:  `Sub-order ${subOrder.id} has been cancelled.`,
      p_metadata: { order_id: orderId, sub_order_id: subOrder.id },
    });

    results.push(subOrder.id);
  }

  logger.info('Order cancelled', { orderId, userId, cancelledSubOrders: results, reason });
  return { cancelledSubOrders: results };
}

// ────────────────────────────────────────────────────────────
// updateSubOrderStatus — shop/rider status transitions
// ────────────────────────────────────────────────────────────
export async function updateSubOrderStatus(subOrderId, newStatus, userRole, shopId, opts = {}) {
  const { reason } = opts;

  const { data: subOrder, error } = await supabaseAdmin
    .from('sub_orders')
    .select('id, status, order_id, orders!inner(customer_id, order_number)')
    .eq('id', subOrderId)
    .single();

  if (error || !subOrder) throw new NotFoundError('Sub-order not found');

  // Enforce state machine transition
  assertTransition(subOrder.status, newStatus, userRole);

  const now = new Date().toISOString();
  const timestampMap = {
    confirmed:        'confirmed_at',
    preparing:        'preparing_at',
    ready_for_pickup: 'ready_at',
    out_for_delivery: 'picked_up_at',
    delivered:        'delivered_at',
    cancelled:        'cancelled_at',
  };

  const updatePayload = { status: newStatus, updated_at: now };
  if (timestampMap[newStatus]) updatePayload[timestampMap[newStatus]] = now;
  if (reason) updatePayload.cancellation_reason = reason;

  const { error: updateErr } = await supabaseAdmin
    .from('sub_orders')
    .update(updatePayload)
    .eq('id', subOrderId);
  if (updateErr) throw updateErr;

  // Audit log
  await supabaseAdmin.from('sub_order_status_history').insert({
    sub_order_id: subOrderId,
    from_status:  subOrder.status,
    to_status:    newStatus,
    notes:        reason,
  });

  // Notify customer on key status changes
  const customerNotifications = {
    confirmed:        { title: 'Order Confirmed!',      msg: `Your order ${subOrder.orders.order_number} has been confirmed by the shop.` },
    out_for_delivery: { title: 'Out for Delivery!',     msg: `Your delivery for ${subOrder.orders.order_number} is on the way.` },
    delivered:        { title: 'Delivered!',            msg: `Your order ${subOrder.orders.order_number} has been delivered.` },
    rejected:         { title: 'Order Rejected',        msg: `Unfortunately your order ${subOrder.orders.order_number} was rejected. ${reason || ''}` },
  };

  if (customerNotifications[newStatus]) {
    const { title, msg } = customerNotifications[newStatus];
    await supabaseAdmin.rpc('notify_user', {
      p_user_id:  subOrder.orders.customer_id,
      p_type:     newStatus,
      p_title:    title,
      p_message:  msg,
      p_metadata: { order_id: subOrder.order_id, sub_order_id: subOrderId },
    });
  }

  logger.info('Sub-order status updated', {
    subOrderId, from: subOrder.status, to: newStatus, role: userRole,
  });

  return { subOrderId, previousStatus: subOrder.status, newStatus };
}
