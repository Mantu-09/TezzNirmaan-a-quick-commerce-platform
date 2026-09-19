// backend/src/services/recommendations.service.js — P17-1
// Smart product recommendations engine.
// Rule-based collaborative filtering — no ML server required.
// Three recommendation types:
//   1. Personalized     — based on user's order history categories
//   2. Similar products — same category, similar price
//   3. Frequently Bought Together — co-purchase mining from orders

import { supabaseAdmin } from '../config/supabase.js';

// ── 1. Personalized recommendations ──────────────────────────────
/**
 * getPersonalizedRecs(profileId, cityId, limit=8)
 * For logged-in users: mine their category preferences from order history.
 * For new/anonymous users: return city bestsellers.
 */
export async function getPersonalizedRecs(profileId, cityId, limit = 8) {
  try {
    if (profileId) {
      // Step 1: Get user's top 3 ordered categories
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('product:products(category)')
        .eq('order_id', supabaseAdmin.from('sub_orders').select('id').eq(
          'order_id', supabaseAdmin.from('orders').select('id').eq('customer_id', profileId)
        ))
        .limit(50);

      // Simpler: get recent orders then items
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('customer_id', profileId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        const { data: subOrders } = await supabaseAdmin
          .from('sub_orders')
          .select('id')
          .in('order_id', orderIds);

        if (subOrders && subOrders.length > 0) {
          const subIds = subOrders.map(s => s.id);
          const { data: orderedItems } = await supabaseAdmin
            .from('order_items')
            .select('inventory:shop_inventory(product:products(category))')
            .in('sub_order_id', subIds)
            .limit(50);

          // Count categories
          const catCount = {};
          (orderedItems || []).forEach(item => {
            const cat = item.inventory?.product?.category;
            if (cat) catCount[cat] = (catCount[cat] || 0) + 1;
          });

          const topCats = Object.entries(catCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([c]) => c);

          if (topCats.length > 0) {
            // Fetch top in-stock products from those categories in the city
            const { data: recs } = await supabaseAdmin
              .from('shop_inventory')
              .select(`
                id, stock_qty, price_paise, discounted_price_paise,
                product:products(id, name, category, image_url, brand),
                shop:shops(city_id)
              `)
              .gt('stock_qty', 0)
              .in('product.category', topCats)
              .eq('shop.city_id', cityId)
              .order('discounted_price_paise', { ascending: true })
              .limit(limit * 2);

            const results = (recs || [])
              .filter(r => r.product && r.shop)
              .slice(0, limit)
              .map(r => ({
                inventory_id:   r.id,
                product_id:     r.product.id,
                name:           r.product.name,
                category:       r.product.category,
                brand:          r.product.brand,
                image_url:      r.product.image_url,
                price_paise:    r.discounted_price_paise || r.price_paise,
                in_stock:       r.stock_qty > 0,
                reason:         `Based on your ${r.product.category} purchases`,
              }));

            if (results.length >= 3) return results;
          }
        }
      }
    }

    // Fallback: city bestsellers
    return getCityBestsellers(cityId, limit);
  } catch (err) {
    console.error('[Recommendations] personalized error:', err.message);
    return getCityBestsellers(cityId, limit);
  }
}

// ── 2. Similar products ───────────────────────────────────────────
/**
 * getSimilarProducts(inventoryId, limit=6)
 * Same category, similar price range (±40%), in-stock.
 */
export async function getSimilarProducts(inventoryId, limit = 6) {
  try {
    // Get base product info
    const { data: base } = await supabaseAdmin
      .from('shop_inventory')
      .select('price_paise, discounted_price_paise, product:products(id, category)')
      .eq('id', inventoryId)
      .single();

    if (!base) return [];

    const price      = base.discounted_price_paise || base.price_paise || 0;
    const minPrice   = Math.round(price * 0.6);
    const maxPrice   = Math.round(price * 1.4);
    const category   = base.product?.category;

    const { data: similar } = await supabaseAdmin
      .from('shop_inventory')
      .select(`
        id, stock_qty, price_paise, discounted_price_paise,
        product:products(id, name, category, image_url, brand, avg_rating)
      `)
      .neq('id', inventoryId)
      .eq('product.category', category)
      .gte('discounted_price_paise', minPrice)
      .lte('discounted_price_paise', maxPrice)
      .gt('stock_qty', 0)
      .limit(limit + 2);

    return (similar || [])
      .filter(r => r.product)
      .slice(0, limit)
      .map(r => ({
        inventory_id: r.id,
        product_id:   r.product.id,
        name:         r.product.name,
        category:     r.product.category,
        brand:        r.product.brand,
        image_url:    r.product.image_url,
        price_paise:  r.discounted_price_paise || r.price_paise,
        avg_rating:   r.product.avg_rating,
        in_stock:     r.stock_qty > 0,
        reason:       'Similar item',
      }));
  } catch (err) {
    console.error('[Recommendations] similar error:', err.message);
    return [];
  }
}

// ── 3. Frequently Bought Together ───────────────────────────────
/**
 * getFrequentlyBoughtTogether(productIds[], limit=4)
 * Mine past orders for co-purchased items.
 */
export async function getFrequentlyBoughtTogether(productIds = [], limit = 4) {
  try {
    if (!productIds.length) return [];

    // Find sub_orders that contained any of these products
    const { data: subItems } = await supabaseAdmin
      .from('order_items')
      .select('sub_order_id, inventory:shop_inventory(product_id)')
      .in('inventory.product_id', productIds)
      .limit(200);

    if (!subItems || !subItems.length) return [];

    const subOrderIds = [...new Set(subItems.map(i => i.sub_order_id))];

    // Get all items in those orders
    const { data: coItems } = await supabaseAdmin
      .from('order_items')
      .select('inventory:shop_inventory(product_id, product:products(id, name, category, image_url, brand), price_paise, discounted_price_paise, stock_qty)')
      .in('sub_order_id', subOrderIds)
      .not('inventory.product_id', 'in', `(${productIds.join(',')})`)
      .limit(500);

    // Count co-occurrences
    const coCount = {};
    const coData  = {};
    (coItems || []).forEach(item => {
      const inv = item.inventory;
      if (!inv || !inv.product_id) return;
      const pid = inv.product_id;
      coCount[pid] = (coCount[pid] || 0) + 1;
      if (!coData[pid]) coData[pid] = inv;
    });

    return Object.entries(coCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pid, count]) => {
        const inv = coData[pid];
        return {
          product_id:   inv.product.id,
          inventory_id: inv.id,
          name:         inv.product.name,
          category:     inv.product.category,
          brand:        inv.product.brand,
          image_url:    inv.product.image_url,
          price_paise:  inv.discounted_price_paise || inv.price_paise,
          in_stock:     inv.stock_qty > 0,
          co_purchases: count,
          reason:       `Bought together ${count} times`,
        };
      });
  } catch (err) {
    console.error('[Recommendations] FBT error:', err.message);
    return [];
  }
}

// ── Internal: city bestsellers ────────────────────────────────────
async function getCityBestsellers(cityId, limit) {
  try {
    const { data } = await supabaseAdmin
      .from('shop_inventory')
      .select(`
        id, stock_qty, price_paise, discounted_price_paise,
        product:products(id, name, category, image_url, brand),
        shop:shops(city_id)
      `)
      .eq('shop.city_id', cityId)
      .gt('stock_qty', 0)
      .order('discounted_price_paise', { ascending: true })
      .limit(limit);

    return (data || [])
      .filter(r => r.product && r.shop)
      .map(r => ({
        inventory_id: r.id,
        product_id:   r.product.id,
        name:         r.product.name,
        category:     r.product.category,
        brand:        r.product.brand,
        image_url:    r.product.image_url,
        price_paise:  r.discounted_price_paise || r.price_paise,
        in_stock:     true,
        reason:       'Popular in your city',
      }));
  } catch {
    return [];
  }
}
