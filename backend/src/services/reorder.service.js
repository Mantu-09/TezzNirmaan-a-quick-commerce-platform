// ────────────────────────────────────────────────────────────
// Reorder Service — P2-D
//
// POST /customer/orders/:orderId/reorder
//
// Flow:
//   1. Fetch original order + all items (ownership validated)
//   2. For each item: check current inventory availability
//      and flag any price changes (parallel Promise.all)
//   3. Clear current cart
//   4. Add available items back (server-side inventory validation)
//   5. Return { added, skipped, price_changes, skipped_items }
//
// Principles:
//   • Prices always come from CURRENT inventory (never re-use
//     historical prices — a contractor's cement may cost more)
//   • Stock is validated live before adding to cart
//   • Unavailable/unlisted items are skipped gracefully, not errored
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { NotFoundError, AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Re-order from an existing order.
 * Clears the current cart and populates it with available items
 * from the original order at CURRENT prices.
 *
 * @param {string} originalOrderId
 * @param {string} userId           - req.user.id (profile_id)
 * @returns {{ added, skipped, price_changes, skipped_items, cart_items }}
 */
export async function reorderFromHistory(originalOrderId, userId) {
  // ── 1. Fetch original order + all items ──────────────────────
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select(`
      id, shop_id, customer_id,
      sub_orders(
        id, delivery_tier,
        order_items(
          id, product_id, product_name, quantity,
          unit_price_paise, inventory_id
        )
      )
    `)
    .eq('id', originalOrderId)
    .eq('customer_id', userId)    // ownership check
    .single();

  if (orderErr || !order) throw new NotFoundError('Order not found');

  const shopId = order.shop_id;

  // Flatten all items across sub-orders, preserving delivery_tier
  const allItems = order.sub_orders.flatMap(sub =>
    (sub.order_items || []).map(item => ({
      ...item,
      delivery_tier:         sub.delivery_tier,
      original_price_paise:  item.unit_price_paise,
    }))
  );

  if (!allItems.length) {
    throw new AppError('Original order has no items to reorder', 400);
  }

  // ── 2. Check current availability of each item (parallel) ────
  const availability = await Promise.all(
    allItems.map(async item => {
      const { data: inv } = await supabaseAdmin
        .from('shop_inventory')
        .select('id, price, is_listed, is_in_stock, stock_quantity')
        .eq('shop_id', shopId)
        .eq('product_id', item.product_id)
        .single();

      const available     = !!(inv?.is_listed && inv?.is_in_stock && (inv?.stock_quantity ?? 0) > 0);
      const currentPrice  = inv?.price ?? null;
      const priceChanged  = available && currentPrice !== null && currentPrice !== item.original_price_paise;

      return {
        ...item,
        available,
        inventory_id:         inv?.id || item.inventory_id,
        current_price_paise:  currentPrice,
        price_changed:        priceChanged,
        // Cap quantity to available stock
        reorder_quantity:     available
          ? Math.min(item.quantity, inv.stock_quantity)
          : 0,
      };
    })
  );

  const availableItems = availability.filter(i => i.available);
  const skippedItems   = availability.filter(i => !i.available);
  const priceChanges   = availableItems.filter(i => i.price_changed);

  // ── 3. Clear current cart ────────────────────────────────────
  const { error: clearErr } = await supabaseAdmin
    .from('cart_items')
    .delete()
    .eq('user_id', userId);

  if (clearErr) {
    logger.error('reorder: cart clear failed', { userId, error: clearErr.message });
    throw new AppError('Failed to clear cart before reorder', 500);
  }

  // ── 4. Add available items to cart ───────────────────────────
  // Use upsert so concurrent reorders don't duplicate rows.
  const cartInserts = availableItems.map(item => ({
    user_id:    userId,
    shop_id:    shopId,
    product_id: item.product_id,
    quantity:   item.reorder_quantity,
    updated_at: new Date().toISOString(),
  }));

  let cartItems = [];
  if (cartInserts.length > 0) {
    const { data: inserted, error: cartErr } = await supabaseAdmin
      .from('cart_items')
      .upsert(cartInserts, {
        onConflict:       'user_id,shop_id,product_id',
        ignoreDuplicates: false,
      })
      .select();

    if (cartErr) {
      logger.error('reorder: cart insert failed', { userId, error: cartErr.message });
      throw new AppError('Failed to add items to cart', 500);
    }
    cartItems = inserted || [];
  }

  logger.info('reorder: complete', {
    userId,
    originalOrderId,
    added:   availableItems.length,
    skipped: skippedItems.length,
    priceChanges: priceChanges.length,
  });

  // ── 5. Return structured result ──────────────────────────────
  return {
    added:   availableItems.length,
    skipped: skippedItems.length,

    // Price-change warnings: client shows "Prices have changed" banner
    price_changes: priceChanges.map(i => ({
      product_name:         i.product_name,
      original_price_paise: i.original_price_paise,
      current_price_paise:  i.current_price_paise,
      diff_paise:           (i.current_price_paise ?? 0) - (i.original_price_paise ?? 0),
    })),

    // Skipped items: client shows bottom sheet list
    skipped_items: skippedItems.map(i => i.product_name),

    // Cart snapshot for the client store to hydrate
    cart_items: cartItems,
  };
}
