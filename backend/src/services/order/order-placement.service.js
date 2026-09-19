// ────────────────────────────────────────────────────────────
// order-placement.service.js — P5-4A: Order Service Split
//
// Contains: previewOrder, placeOrder, previewBasket, placeBasketOrder
//
// KEY RULES (non-negotiable per architecture):
//  1. Prices are ALWAYS re-read from DB server-side. Never trust client prices.
//  2. All amounts in PAISE (bigint). No floats.
//  3. Stock decrement is atomic via Postgres stored procedure.
//  4. State machine is enforced for all status transitions.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../../config/supabase.js';
import { generateOrderNumber } from '../../utils/orderNumber.js';
import { calcLineItem, calcDeliveryFee } from '../../utils/money.js';
import { NotFoundError, AppError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import * as notificationService from '../notification.service.js';
import * as geoService from '../geo.service.js';
import { invalidateShopInventoryCache } from '../cache.service.js'; // P2-C
import { applyPassBenefits }            from '../subscription.service.js'; // P5-3
import { broadcastToShop }              from '../../lib/websocket.js';     // P6-1

// ────────────────────────────────────────────────────────────
// previewOrder
// Returns a dry-run breakdown without writing to DB.
// Shows the customer what they'll pay before confirming.
// ────────────────────────────────────────────────────────────
export async function previewOrder(userId, addressId) {
  // 1. Fetch the customer's cart items with server-side prices
  const { data: cartItems, error: cartErr } = await supabaseAdmin
    .from('cart_items')
    .select(`
      id, quantity,
      product:products(
        id, name, delivery_tier, unit, gst_percent,
        images
      ),
      inventory:shop_inventory!inner(
        id, price, is_in_stock, is_listed,
        shop:shops!inner(
          id, name, quick_delivery_radius_km, scheduled_delivery_radius_km,
          is_active, is_accepting_orders
        )
      )
    `)
    .eq('user_id', userId);

  if (cartErr) throw cartErr;
  if (!cartItems || cartItems.length === 0) throw new AppError('Your cart is empty', 400);

  // Validate all items in stock and shop is open
  for (const item of cartItems) {
    if (!item.inventory.is_listed || !item.inventory.is_in_stock) {
      throw new AppError(`"${item.product.name}" is currently out of stock`, 400);
    }
    if (!item.inventory.shop.is_active || !item.inventory.shop.is_accepting_orders) {
      throw new AppError(`"${item.inventory.shop.name}" is not accepting orders right now`, 400);
    }
  }

  const shop = cartItems[0].inventory.shop;

  // 2. Fetch delivery address — must belong to this user
  const { data: address, error: addrErr } = await supabaseAdmin
    .from('addresses')
    .select('id, label, full_name, phone, address_line1, city, pincode, location, lat, lng')
    .eq('id', addressId)
    .eq('user_id', userId)
    .single();

  if (addrErr || !address) throw new NotFoundError('Delivery address not found');

  // 3. Geo-eligibility check per delivery tier
  if (address.lat && address.lng) {
    const shopId      = cartItems[0].inventory.shop.id;
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
export async function placeOrder(userId, { addressId, paymentMethod, notes, scheduledSlot, promoCode }) {
  // Step 1: Get a fresh preview — this validates everything and computes server-side totals
  const preview = await previewOrder(userId, addressId);

  // Step 1b: P1-C — Validate promo code if provided (server-side, never trust client discount)
  let appliedPromo = null;
  if (promoCode?.trim()) {
    // P19-4: WELCOME10 is a system-issued first-order code — handle without DB lookup
    if (promoCode.trim().toUpperCase() === 'WELCOME10') {
      const discountPaise = Math.min(Math.round(preview.grandTotalPaise * 0.10), 10000); // 10% up to Rs.100
      appliedPromo = { discount_paise: discountPaise, code: 'WELCOME10', description: '10% first-order welcome discount' };
      // Mark profile as having used the first-order discount
      supabaseAdmin.from('profiles').update({ first_order_discount_used: true }).eq('auth_id', userId).catch(() => {});
    } else {
      const { validatePromo } = await import('../promo.service.js');
      const tier = preview.tiers.quick && preview.tiers.scheduled ? null
        : preview.tiers.quick ? 'quick' : 'scheduled';
      appliedPromo = await validatePromo(
        promoCode,
        userId,
        preview.grandTotalPaise,   // validate against server-computed total
        tier
      );
    }
  }

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

  const { order_id, order_number, total_amount_paise: rawTotal } = result;

  // P1-C: Subtract promo discount from the server-confirmed total
  const discountPaise      = appliedPromo?.discount_paise || 0;
  let   total_amount_paise = Math.max(0, rawTotal - discountPaise);

  // P5-3: Apply TezzPass benefit (delivery fee waiver)
  // applyPassBenefits always resolves — never throws — so this is safe.
  const grandDelivery = (quickTier?.deliveryFeePaise || 0) + (schedTier?.deliveryFeePaise || 0);
  const { feeWaived, cashbackMultiplier } = await applyPassBenefits(
    userId, order_id, grandDelivery,
  );
  if (feeWaived > 0) {
    total_amount_paise = Math.max(0, total_amount_paise - feeWaived);
    logger.info('P5-3: Pass delivery fee waived', { userId, orderId: order_id, feeWaived });
  }

  // P1-C: Record promo redemption + increment usage_count AFTER atomic order creation
  if (appliedPromo) {
    try {
      const { recordRedemption } = await import('../promo.service.js');
      await recordRedemption(appliedPromo.promo_id, userId, order_id, discountPaise);
    } catch (promoErr) {
      // Non-fatal: order is placed. Log for manual reconciliation.
      logger.error('placeOrder: promo redemption recording failed', {
        orderId: order_id, promoId: appliedPromo.promo_id, error: promoErr.message,
      });
    }
  }

  logger.info('Order placed', { orderId: order_id, orderNumber: order_number, totalPaise: total_amount_paise, userId });

  // P2-C: stock was decremented atomically in the RPC — invalidate inventory cache
  invalidateShopInventoryCache(shopId).catch(() => {});

  // Step 8a: P3-C — Wallet payment (full or partial)
  let walletDebited    = 0;
  let razorpayRequired = true;

  if (paymentMethod === 'wallet') {
    const { debitWallet } = await import('../wallet.service.js');
    await debitWallet(userId, total_amount_paise, order_id);
    walletDebited    = total_amount_paise;
    razorpayRequired = false;
    await supabaseAdmin
      .from('payments')
      .update({ status: 'captured', updated_at: new Date().toISOString() })
      .eq('order_id', order_id);
    logger.info('placeOrder: paid fully via wallet', { orderId: order_id, amountPaise: total_amount_paise });
  } else if (paymentMethod === 'wallet_partial') {
    const { getApplicableWalletAmount, debitWallet } = await import('../wallet.service.js');
    const { max_usable_paise } = await getApplicableWalletAmount(userId, total_amount_paise);
    if (max_usable_paise > 0) {
      await debitWallet(userId, max_usable_paise, order_id);
      walletDebited = max_usable_paise;
      logger.info('placeOrder: partial wallet debit', { orderId: order_id, walletDebited });
    }
    razorpayRequired = true;
  }

  // Step 8b: For online payments — create Razorpay order
  const remainingPaise = total_amount_paise - walletDebited;
  let razorpayOrderId = null;

  if (razorpayRequired && remainingPaise > 0 && ['upi', 'card', 'netbanking', 'wallet_partial'].includes(paymentMethod)) {
    try {
      const { razorpay } = await import('../../config/razorpay.js');
      const rzpOrder = await razorpay.orders.create({
        amount:   remainingPaise,
        currency: 'INR',
        receipt:  order_number,
        notes:    { order_id, wallet_debited: walletDebited },
      });
      razorpayOrderId = rzpOrder.id;
      await supabaseAdmin
        .from('payments')
        .update({ razorpay_order_id: razorpayOrderId, updated_at: new Date().toISOString() })
        .eq('order_id', order_id)
        .eq('status', 'pending');
      logger.info('Razorpay order created', { razorpayOrderId, orderId: order_id, remainingPaise });
    } catch (rzpErr) {
      // Non-fatal — order is placed, payment link creation failed
      logger.error('Razorpay order creation failed', { error: rzpErr.message, orderId: order_id });
    }
  }

  // B1: Notify customer that order is placed
  notificationService.notifyOrderPlaced(userId, order_number, order_id);

  // P4-2A: Fire referral reward check — non-blocking
  import('../../lib/jobQueue.js')
    .then(({ enqueueReferralReward }) => enqueueReferralReward(userId, order_id))
    .catch(err => logger.warn('placeOrder: failed to enqueue referral reward (non-fatal)', { error: err.message }));

  // P5-5A: Low-stock alert — fire-and-forget per ordered item
  // Re-reads stock after atomic decrement so we get the final quantity.
  // Never throws — alert failure must not affect the order response.
  import('../../lib/jobQueue.js')
    .then(async ({ enqueueLowStockAlert }) => {
      for (const item of allItems) {
        // allItems: [{ inventory_id, shop_id, product_name, quantity, ... }]
        if (!item.inventory_id) continue;

        const { data: inv } = await supabaseAdmin
          .from('shop_inventory')
          .select('id, stock_quantity, low_stock_threshold, products(name)')
          .eq('id', item.inventory_id)
          .single();

        if (!inv) continue;

        const currentStock = Number(inv.stock_quantity);
        const threshold    = Number(inv.low_stock_threshold ?? 5);

        if (currentStock <= threshold) {
          await enqueueLowStockAlert({
            shopId:       shopId,
            inventoryId:  inv.id,
            productName:  inv.products?.name || item.product_name || 'Unknown product',
            currentStock,
            threshold,
          });
        }
      }
    })
    .catch(err => logger.warn('placeOrder: low-stock check failed (non-fatal)', { error: err.message }));

  // B1: Notify shop owner of new order
  supabaseAdmin
    .from('shops')
    .select('profile_id, profiles!profile_id(id)')
    .eq('id', shopId)
    .single()
    .then(({ data: shopRow }) => {
      if (shopRow?.profile_id) {
        notificationService.notifyShopNewOrder(shopRow.profile_id, order_number, order_id, allItems.length);
      }
    })
    .catch(err => logger.error('Could not notify shop owner of new order', { error: err.message, shopId }));

  // P6-1: Real-time new-order push to shop dashboard via Socket.IO
  // Fire-and-forget — never block the order response on WS delivery
  broadcastToShop(shopId, 'NEW_ORDER', {
    order_number:  order_number,
    total_paise:   total_amount_paise,
    item_count:    allItems.length,
    order_id,
  });

  return {
    orderId:         order_id,
    orderNumber:     order_number,
    totalPaise:      total_amount_paise,
    totalRupees:     (total_amount_paise / 100).toFixed(2),
    discountPaise,
    promoApplied:    appliedPromo ? { code: appliedPromo.code, discount_paise: discountPaise } : null,
    // P5-3: pass benefit details for OrderConfirmation screen
    passApplied:     feeWaived > 0 ? { feeWaivedPaise: feeWaived, cashbackMultiplier } : null,
    razorpayOrderId,
    razorpayKeyId:   razorpayOrderId ? process.env.RAZORPAY_KEY_ID : null,
    preview,
  };
}

// ────────────────────────────────────────────────────────────
// previewBasket — P4-3B: Multi-shop dry-run preview
//
// Returns per-shop breakdowns grouped by shopId.
// Falls back to single-shop shape when only 1 shop in cart
// (fully backward-compatible with CheckoutScreen).
// ────────────────────────────────────────────────────────────
export async function previewBasket(userId, addressId) {
  // 1. Fetch all cart items with server-side prices
  const { data: cartItems, error: cartErr } = await supabaseAdmin
    .from('cart_items')
    .select(`
      id, quantity, shop_id,
      product:products(
        id, name, delivery_tier, unit, gst_percent, images
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

  // Validate all items in stock
  for (const item of cartItems) {
    if (!item.inventory.is_listed || !item.inventory.is_in_stock) {
      throw new AppError(`"${item.product.name}" is currently out of stock`, 400);
    }
    if (!item.inventory.shop.is_active || !item.inventory.shop.is_accepting_orders) {
      throw new AppError(`"${item.inventory.shop.name}" is not accepting orders right now`, 400);
    }
  }

  // 2. Fetch delivery address
  const { data: address, error: addrErr } = await supabaseAdmin
    .from('addresses')
    .select('id, label, full_name, phone, address_line1, city, pincode, location, lat, lng')
    .eq('id', addressId)
    .eq('user_id', userId)
    .single();

  if (addrErr || !address) throw new NotFoundError('Delivery address not found');

  // 3. Group items by shop
  const shopGroups = {};
  for (const item of cartItems) {
    const sid = item.shop_id;
    if (!shopGroups[sid]) {
      shopGroups[sid] = { shop: item.inventory.shop, items: [] };
    }
    shopGroups[sid].items.push(item);
  }

  // 4. Per-shop geo check + tier breakdown
  let basketSubtotal = 0, basketDelivery = 0, basketTax = 0, basketTotal = 0;
  const shops = {};

  for (const [shopId, { shop, items }] of Object.entries(shopGroups)) {
    if (address.lat && address.lng) {
      const tiersInShop = [...new Set(items.map(i => i.product.delivery_tier))];
      for (const tier of tiersInShop) {
        try {
          const eligibility = await geoService.checkDeliveryEligibility(
            shopId, { lat: address.lat, lng: address.lng }, tier
          );
          if (!eligibility.eligible) {
            const tierLabel = tier === 'quick' ? 'Quick (90-min)' : 'Scheduled';
            throw new AppError(
              `"${shop.name}": Delivery not available for ${tierLabel} items ` +
              `(${eligibility.distanceKm?.toFixed(1) || '?'} km away, max ${eligibility.radiusKm} km).`,
              422, 'OUTSIDE_DELIVERY_RANGE'
            );
          }
        } catch (geoErr) {
          if (geoErr.code === 'OUTSIDE_DELIVERY_RANGE') throw geoErr;
          logger.warn('Basket geo check failed — skipping', { error: geoErr.message, shopId, tier });
        }
      }
    }

    const tierGroups = { quick: [], scheduled: [] };
    for (const item of items) {
      const tier = item.product.delivery_tier;
      const { subtotalPaise, taxPaise, totalPaise } = calcLineItem(
        item.quantity, item.inventory.price, item.product.gst_percent
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

    const tierSummary = {};
    let shopSubtotal = 0, shopDelivery = 0, shopTax = 0, shopTotal = 0;

    for (const [tier, tItems] of Object.entries(tierGroups)) {
      if (tItems.length === 0) continue;
      const subtotalPaise  = tItems.reduce((s, i) => s + i.subtotalPaise, 0);
      const taxPaise       = tItems.reduce((s, i) => s + i.taxAmountPaise, 0);
      const deliveryFee    = calcDeliveryFee(tier, subtotalPaise);
      const totalPaise     = subtotalPaise + taxPaise + deliveryFee;

      tierSummary[tier] = {
        items: tItems, subtotalPaise, taxPaise,
        deliveryFeePaise: deliveryFee, totalPaise,
        estimatedDelivery: tier === 'quick'
          ? new Date(Date.now() + 90 * 60000).toISOString()
          : new Date(Date.now() + 24 * 3600000).toISOString(),
      };

      shopSubtotal += subtotalPaise;
      shopDelivery += deliveryFee;
      shopTax      += taxPaise;
      shopTotal    += totalPaise;
    }

    shops[shopId] = {
      shopId,
      shopName:             shop.name,
      tiers:                tierSummary,
      shopSubtotalPaise:    shopSubtotal,
      shopDeliveryPaise:    shopDelivery,
      shopTaxPaise:         shopTax,
      shopTotalPaise:       shopTotal,
    };

    basketSubtotal += shopSubtotal;
    basketDelivery += shopDelivery;
    basketTax      += shopTax;
    basketTotal    += shopTotal;
  }

  return {
    address,
    shops,
    shopCount:              Object.keys(shops).length,
    basketSubtotalPaise:    basketSubtotal,
    basketDeliveryPaise:    basketDelivery,
    basketTaxPaise:         basketTax,
    basketTotalPaise:       basketTotal,
    basketTotalRupees:      (basketTotal / 100).toFixed(2),
    // V1-compat: single-shop callers get the same shape as previewOrder()
    ...(Object.keys(shops).length === 1 && {
      shopId:              Object.keys(shops)[0],
      shopName:            Object.values(shops)[0].shopName,
      tiers:               Object.values(shops)[0].tiers,
      grandSubtotalPaise:  basketSubtotal,
      grandDeliveryPaise:  basketDelivery,
      grandTaxPaise:       basketTax,
      grandTotalPaise:     basketTotal,
      grandTotalRupees:    (basketTotal / 100).toFixed(2),
    }),
  };
}

// ────────────────────────────────────────────────────────────
// placeBasketOrder — P4-3B: Multi-shop checkout
//
// One basket → one order per shop → single Razorpay payment.
// Discount is split proportionally across shops.
// Payment atomicity: if one shop's RPC fails after payment,
// retry ×3 then flag basket as partial_success + alert admin.
// ────────────────────────────────────────────────────────────
export async function placeBasketOrder(userId, { addressId, paymentMethod, notes, promoCode }) {
  // 1. Multi-shop preview (validates stock, geo, prices)
  const preview = await previewBasket(userId, addressId);

  // 2. Promo validation against basket total (server-side, never trust client)
  let appliedPromo = null;
  if (promoCode?.trim()) {
    const { validatePromo } = await import('../promo.service.js');
    appliedPromo = await validatePromo(promoCode, userId, preview.basketTotalPaise, null);
  }
  const discountPaise  = appliedPromo?.discount_paise || 0;
  const finalTotal     = Math.max(0, preview.basketTotalPaise - discountPaise);

  // 3. Create basket record
  const { data: basket, error: basketErr } = await supabaseAdmin
    .from('order_baskets')
    .insert({
      user_id:            userId,
      total_amount_paise: finalTotal,
      payment_status:     'pending',
      promo_code_id:      appliedPromo?.promo_id || null,
      discount_paise:     discountPaise,
      shop_count:         preview.shopCount,
    })
    .select('id')
    .single();

  if (basketErr) throw basketErr;
  const basketId = basket.id;

  // 4. Fetch address snapshot (frozen at order time)
  const { data: address } = await supabaseAdmin
    .from('addresses')
    .select('label, full_name, phone, address_line1, address_line2, landmark, city, state, pincode')
    .eq('id', addressId)
    .single();
  const addressSnapshot = { ...address, id: addressId };

  // 5. Place one order per shop — parallel, with per-shop proportional discount
  const shopEntries = Object.entries(preview.shops);

  async function placeShopOrder([shopId, shopPreview], retries = 3) {
    const shopDiscount = preview.basketTotalPaise > 0
      ? Math.round(discountPaise * shopPreview.shopTotalPaise / preview.basketTotalPaise)
      : 0;
    const shopFinalTotal = Math.max(0, shopPreview.shopTotalPaise - shopDiscount);

    const orderNumber = await generateOrderNumber();
    const allItems    = Object.values(shopPreview.tiers)
      .flatMap(t => t.items)
      .map(item => ({
        inventory_id:       item.inventoryId,
        product_id:         item.productId,
        product_name:       item.productName,
        product_image_url:  item.productImageUrl,
        unit:               item.unit,
        delivery_tier:      item.deliveryTier,
        quantity:           item.quantity,
        unit_price_paise:   item.unitPricePaise,
        tax_percent:        item.taxPercent,
        tax_amount_paise:   item.taxAmountPaise,
        total_price_paise:  item.totalPricePaise,
      }));

    const quickTier = shopPreview.tiers.quick;
    const schedTier = shopPreview.tiers.scheduled;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data: result, error: rpcErr } = await supabaseAdmin.rpc('place_order_atomic', {
          p_customer_id:        userId,
          p_shop_id:            shopId,
          p_address_id:         addressId,
          p_address_snapshot:   addressSnapshot,
          p_payment_method:     paymentMethod,
          p_notes:              notes || null,
          p_order_number:       orderNumber,
          p_items:              allItems,
          p_quick_subtotal:     quickTier?.subtotalPaise   || 0,
          p_quick_delivery_fee: quickTier?.deliveryFeePaise || 0,
          p_quick_tax:          quickTier?.taxPaise         || 0,
          p_sched_subtotal:     schedTier?.subtotalPaise   || 0,
          p_sched_delivery_fee: schedTier?.deliveryFeePaise || 0,
          p_sched_tax:          schedTier?.taxPaise         || 0,
          p_sched_slot_start:   null,
          p_sched_slot_end:     null,
        });

        if (rpcErr) {
          const msg = rpcErr.message || '';
          if (msg.includes('STOCK_UNAVAILABLE'))   throw new AppError(msg.replace('STOCK_UNAVAILABLE: ', ''), 409);
          if (msg.includes('PRICE_CHANGED'))       throw new AppError(msg.replace('PRICE_CHANGED: ', ''), 409);
          if (msg.includes('PRODUCT_UNAVAILABLE')) throw new AppError(msg.replace('PRODUCT_UNAVAILABLE: ', ''), 409);
          throw rpcErr;
        }

        await supabaseAdmin
          .from('orders')
          .update({ basket_id: basketId })
          .eq('id', result.order_id);

        invalidateShopInventoryCache(shopId).catch(() => {});

        return {
          orderId:      result.order_id,
          orderNumber:  result.order_number,
          shopId,
          shopName:     shopPreview.shopName,
          totalPaise:   shopFinalTotal,
          discountPaise: shopDiscount,
          success:      true,
        };
      } catch (err) {
        if (attempt === retries) {
          logger.error('placeBasketOrder: shop order failed after retries', {
            basketId, shopId, shopName: shopPreview.shopName, error: err.message,
          });
          return { shopId, shopName: shopPreview.shopName, success: false, error: err.message };
        }
        logger.warn(`placeBasketOrder: shop order attempt ${attempt} failed, retrying`, {
          shopId, error: err.message,
        });
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }
  }

  const shopResults      = await Promise.all(shopEntries.map(entry => placeShopOrder(entry)));
  const successfulOrders = shopResults.filter(r => r.success);
  const failedShops      = shopResults.filter(r => !r.success);

  if (failedShops.length > 0) {
    logger.error('placeBasketOrder: partial failure — some shops failed', {
      basketId, failedShops: failedShops.map(s => ({ shopId: s.shopId, error: s.error })),
    });
    await supabaseAdmin
      .from('order_baskets')
      .update({ payment_status: 'partial_success' })
      .eq('id', basketId);
  }

  if (successfulOrders.length === 0) {
    throw new AppError('All shop orders failed during basket checkout. Please try again.', 500);
  }

  // 6. Record promo redemption (non-fatal, keyed to basket)
  if (appliedPromo && successfulOrders[0]?.orderId) {
    try {
      const { recordRedemption } = await import('../promo.service.js');
      await recordRedemption(appliedPromo.promo_id, userId, successfulOrders[0].orderId, discountPaise);
    } catch (promoErr) {
      logger.error('placeBasketOrder: promo redemption recording failed', {
        basketId, promoId: appliedPromo.promo_id, error: promoErr.message,
      });
    }
  }

  // 7. Handle payment — one Razorpay order for the entire basket total
  let razorpayOrderId  = null;
  let walletDebited    = 0;
  let razorpayRequired = true;

  if (paymentMethod === 'wallet') {
    const { debitWallet } = await import('../wallet.service.js');
    await debitWallet(userId, finalTotal, successfulOrders[0].orderId);
    walletDebited    = finalTotal;
    razorpayRequired = false;
    await supabaseAdmin
      .from('order_baskets')
      .update({ payment_status: 'paid' })
      .eq('id', basketId);
  } else if (paymentMethod === 'wallet_partial') {
    const { getApplicableWalletAmount, debitWallet } = await import('../wallet.service.js');
    const { max_usable_paise } = await getApplicableWalletAmount(userId, finalTotal);
    if (max_usable_paise > 0) {
      await debitWallet(userId, max_usable_paise, successfulOrders[0].orderId);
      walletDebited = max_usable_paise;
    }
    razorpayRequired = true;
  }

  const remainingPaise = finalTotal - walletDebited;

  if (razorpayRequired && remainingPaise > 0 &&
      ['upi', 'card', 'netbanking', 'wallet_partial'].includes(paymentMethod)) {
    try {
      const { razorpay } = await import('../../config/razorpay.js');
      const rzpOrder = await razorpay.orders.create({
        amount:   remainingPaise,
        currency: 'INR',
        receipt:  basketId,
        notes:    { basket_id: basketId, shop_count: preview.shopCount, wallet_debited: walletDebited },
      });
      razorpayOrderId = rzpOrder.id;
      await supabaseAdmin
        .from('order_baskets')
        .update({ razorpay_order_id: razorpayOrderId })
        .eq('id', basketId);
      logger.info('Basket Razorpay order created', { razorpayOrderId, basketId, remainingPaise });
    } catch (rzpErr) {
      logger.error('Basket Razorpay order creation failed', { error: rzpErr.message, basketId });
    }
  }

  // 8. Notify customers for each successful order
  for (const order of successfulOrders) {
    notificationService.notifyOrderPlaced(userId, order.orderNumber, order.orderId);
  }

  // 9. Enqueue referral reward (first order check) — non-blocking
  if (successfulOrders[0]?.orderId) {
    import('../../lib/jobQueue.js')
      .then(({ enqueueReferralReward }) => enqueueReferralReward(userId, successfulOrders[0].orderId))
      .catch(err => logger.warn('placeBasketOrder: referral enqueue failed', { error: err.message }));
  }

  // 10. Clear cart
  await supabaseAdmin.from('cart_items').delete().eq('user_id', userId);

  return {
    basketId,
    orders:          successfulOrders,
    failedShops,
    basketTotalPaise: finalTotal,
    discountPaise,
    shopCount:       successfulOrders.length,
    razorpayOrderId,
    razorpayKeyId:   razorpayOrderId ? process.env.RAZORPAY_KEY_ID : null,
    promoApplied:    appliedPromo ? { code: appliedPromo.code, discount_paise: discountPaise } : null,
  };
}
