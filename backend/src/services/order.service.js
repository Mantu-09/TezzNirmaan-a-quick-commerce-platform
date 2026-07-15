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
import * as notificationService from './notification.service.js';
import * as geoService from './geo.service.js';

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
    .select('id, label, full_name, phone, address_line1, city, pincode, location, lat, lng')
    .eq('id', addressId)
    .eq('user_id', userId)
    .single();

  if (addrErr || !address) throw new NotFoundError('Delivery address not found');

  // 3b. Geo eligibility check (A9c) — uses lat/lng columns added by migration 016.
  // Spec: if no coordinates, throw an error prompting the user to re-add address.
  // We gracefully degrade here (warn + continue) so customers with old addresses
  // aren't blocked from ordering during the migration rollout period.
  // TODO: Harden to throw once all customers have re-saved their addresses.
  if (address.lat && address.lng) {
    const shopId     = cartItems[0].inventory.shop.id;
    const tiersInCart = [...new Set(cartItems.map(i => i.product.delivery_tier))];
    for (const tier of tiersInCart) {
      try {
        const eligibility = await geoService.checkDeliveryEligibility(
          shopId, { lat: address.lat, lng: address.lng }, tier
        );
        if (!eligibility.eligible) {
          const tierLabel = tier === 'quick' ? 'Quick (90-min)' : 'Scheduled';
          throw new AppError(
            `Delivery not available for ${tierLabel} items at your address ` +
            `(${eligibility.distanceKm?.toFixed(1) || '?'} km away, ` +
            `max ${eligibility.radiusKm} km). ` +
            `Please use a different address or choose Scheduled delivery.`,
            422,
            'OUTSIDE_DELIVERY_RANGE'
          );
        }
      } catch (geoErr) {
        if (geoErr.code === 'OUTSIDE_DELIVERY_RANGE') throw geoErr;
        logger.warn('Geo eligibility check failed — skipping', { error: geoErr.message, shopId, tier });
      }
    }
  } else if (address.location) {
    // Fallback: parse GeoJSON from PostGIS geography column (pre-migration 016 addresses)
    try {
      const geo = typeof address.location === 'string'
        ? JSON.parse(address.location)
        : address.location;
      if (geo?.type === 'Point' && Array.isArray(geo.coordinates)) {
        const lng = geo.coordinates[0];
        const lat = geo.coordinates[1];
        const shopId      = cartItems[0].inventory.shop.id;
        const tiersInCart = [...new Set(cartItems.map(i => i.product.delivery_tier))];
        for (const tier of tiersInCart) {
          try {
            const eligibility = await geoService.checkDeliveryEligibility(shopId, { lat, lng }, tier);
            if (!eligibility.eligible) {
              const tierLabel = tier === 'quick' ? 'Quick (90-min)' : 'Scheduled';
              throw new AppError(
                `Delivery not available for ${tierLabel} items at your address.`,
                422,
                'OUTSIDE_DELIVERY_RANGE'
              );
            }
          } catch (geoErr) {
            if (geoErr.code === 'OUTSIDE_DELIVERY_RANGE') throw geoErr;
            logger.warn('Geo fallback check failed', { error: geoErr.message });
          }
        }
      }
    } catch (parseErr) {
      if (parseErr.code === 'OUTSIDE_DELIVERY_RANGE') throw parseErr;
      logger.warn('Could not parse address location for geo check', { addressId });
    }
  } else {
    // No location data at all — log and continue (graceful for V1 rollout)
    logger.warn('Address has no location data — skipping geo check', { addressId });
  }

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

  // B1: Notify customer that order is placed
  notificationService.notifyOrderPlaced(userId, order_number, order_id);

  // B1: Notify shop owner of new order
  // Fetch shop owner profile_id from shops table
  supabaseAdmin
    .from('shops')
    .select('profile_id, profiles!profile_id(id)')
    .eq('id', shopId)
    .single()
    .then(({ data: shopRow }) => {
      if (shopRow?.profile_id) {
        notificationService.notifyShopNewOrder(
          shopRow.profile_id,
          order_number,
          order_id,
          allItems.length
        );
      }
    })
    .catch(err => logger.error('Could not notify shop owner of new order', { error: err.message, shopId }));

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
      id, order_number, total_amount, placed_at, shop_id,
      sub_orders(
        id, sub_order_number, delivery_tier, status, total_amount,
        estimated_delivery_at, delivered_at,
        order_items(
          id, product_id, inventory_id,
          product_name, product_image_url, unit, delivery_tier,
          quantity, unit_price, total_price
        )
      )
    `, { count: 'exact' })
    .eq('customer_id', userId)
    .order('placed_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;
  return {
    orders: data,
    pagination: {
      page:    +page,
      limit:   +limit,
      total:   count,
      // hasMore is checked by useInfiniteQuery in OrderHistoryScreen
      hasMore: count > (+page) * (+limit),
    },
  };
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
    // FIX A6: Cannot use supabaseAdmin.rpc() inside .update() value — it returns a
    // query builder, not a scalar. Use the increment_inventory_stock RPC instead.
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity, inventory_id')
      .eq('sub_order_id', subOrder.id);

    if (items?.length) {
      for (const item of items) {
        // Prefer inventory_id (added by migration 015) — uses the overloaded
        // increment_inventory_stock(p_inventory_id, p_amount) from migration 016.
        // Fall back to (p_shop_id, p_product_id, p_amount) for pre-migration orders.
        if (item.inventory_id) {
          const { error: stockErr } = await supabaseAdmin.rpc('increment_inventory_stock', {
            p_inventory_id: item.inventory_id,
            p_amount:       item.quantity,
          });
          if (stockErr) {
            logger.error('Failed to restore stock (by inventory_id)', {
              inventoryId: item.inventory_id, error: stockErr.message,
            });
          }
        } else {
          // Legacy path: look up shop_id from parent order
          const { data: subOrderWithShop } = await supabaseAdmin
            .from('sub_orders')
            .select('orders!inner(shop_id)')
            .eq('id', subOrder.id)
            .single();

          const shopId = subOrderWithShop?.orders?.shop_id;
          if (shopId) {
            const { error: stockErr } = await supabaseAdmin.rpc('increment_inventory_stock', {
              p_shop_id:    shopId,
              p_product_id: item.product_id,
              p_amount:     item.quantity,
            });
            if (stockErr) {
              logger.error('Failed to restore stock (by shop+product)', {
                productId: item.product_id, shopId, error: stockErr.message,
              });
            }
          }
        }
      }
    }

    // FIX A10: Use notificationService.sendNotification instead of supabaseAdmin.rpc('notify_user')
    // notificationService has its own try/catch and never throws — safe to call here
    await notificationService.sendNotification(
      userId,
      'order_cancelled',
      'Order Cancelled',
      `Sub-order ${subOrder.id} has been cancelled.`,
      { order_id: orderId, sub_order_id: subOrder.id }
    );

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

  // B1: Notify relevant party on each status change using typed helpers (include SMS)
  const customerId  = subOrder.orders.customer_id;
  const orderNumber = subOrder.orders.order_number;
  const orderId     = subOrder.order_id;

  if (newStatus === 'confirmed') {
    notificationService.notifyOrderConfirmed(customerId, orderNumber, orderId);
  } else if (newStatus === 'preparing') {
    notificationService.notifyOrderPreparing(customerId, orderNumber, orderId);
  } else if (newStatus === 'out_for_delivery') {
    notificationService.notifyOutForDelivery(customerId, orderNumber, orderId, subOrderId);
  } else if (newStatus === 'delivered') {
    notificationService.notifyDelivered(customerId, orderNumber, orderId);
  } else if (newStatus === 'rejected') {
    notificationService.notifyOrderRejected(customerId, orderNumber, orderId, reason);
  }

  logger.info('Sub-order status updated', {
    subOrderId, from: subOrder.status, to: newStatus, role: userRole,
  });

  return { subOrderId, previousStatus: subOrder.status, newStatus };
}
