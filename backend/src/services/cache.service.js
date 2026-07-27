// ────────────────────────────────────────────────────────────
// Cache Service — P2-C
//
// High-level domain caches built on top of the Redis helpers
// in config/redis.js. Two caches:
//
//   1. Shop Inventory Cache
//      Key:  inventory:{shopId}
//      TTL:  5 min (300s)
//      Why:  Product catalog reads happen dozens of times per
//            session (home page, category, search, PDP).
//            Invalidated immediately on any stock/price write.
//
//   2. Nearby Shops Cache
//      Key:  nearby:{gridLat}:{gridLng}
//      TTL:  2 min (120s)
//      Why:  find_nearby_shops() is a PostGIS ST_DWithin query
//            — expensive at scale. Snapped to a 0.01° grid
//            (~1 km cell) so nearby users share the same entry.
//
// Both functions fail-open: if Redis is unavailable they fall
// through to the live DB query, so the app never breaks.
// ────────────────────────────────────────────────────────────
import { cacheGet, cacheSet, cacheDel } from '../config/redis.js';
import logger from '../utils/logger.js';

// ── TTLs ──────────────────────────────────────────────────────
const TTL_INVENTORY_S  = 300;  // 5 min
const TTL_NEARBY_S     = 120;  // 2 min

// ── Key builders ──────────────────────────────────────────────
const inventoryKey = (shopId)          => `inventory:${shopId}`;
const nearbyKey    = (gLat, gLng)      => `nearby:${gLat}:${gLng}`;

// ── Grid snapping for nearby shops ───────────────────────────
// Snap to 0.01° grid (~1 km) so users within the same ~1 km
// cell share a single cache entry, drastically reducing
// the number of distinct PostGIS calls.
function snapToGrid(coord) {
  return Math.round(coord * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Inventory Cache
// ─────────────────────────────────────────────────────────────

/**
 * Get cached shop inventory. On miss, fetches from DB via
 * inventoryService.getInventory() and populates the cache.
 *
 * Called from: shop catalog routes (GET /shop/inventory)
 *
 * @param {string}   shopId
 * @param {Function} fetchFn - async () => data  (injected to avoid circular deps)
 * @returns {object} { inventory, pagination }
 */
export async function getCachedShopInventory(shopId, fetchFn) {
  const key = inventoryKey(shopId);

  try {
    const cached = await cacheGet(key);
    if (cached) {
      // cacheGet already returns parsed JSON for Upstash; for MockRedis it's a string
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      logger.debug('[Cache] HIT inventory', { shopId });
      return parsed;
    }
  } catch (err) {
    logger.warn('[Cache] inventory get error — bypassing cache', { shopId, error: err.message });
  }

  // Cache miss — fetch from DB
  logger.debug('[Cache] MISS inventory', { shopId });
  const data = await fetchFn();

  try {
    await cacheSet(key, data, TTL_INVENTORY_S);
  } catch (err) {
    logger.warn('[Cache] inventory set error', { shopId, error: err.message });
  }

  return data;
}

/**
 * Invalidate the inventory cache for a shop.
 * Called on every write that changes what customers see:
 *   • updateInventoryItem
 *   • addToInventory (createInventoryItem)
 *   • placeOrder (stock decrement)
 *   • cancelOrderByCustomer (stock restore)
 *
 * @param {string} shopId
 */
export async function invalidateShopInventoryCache(shopId) {
  if (!shopId) return;
  try {
    await cacheDel(inventoryKey(shopId));
    logger.debug('[Cache] INVALIDATED inventory', { shopId });
  } catch (err) {
    // Non-fatal — stale cache is better than a broken write path
    logger.warn('[Cache] inventory invalidation error', { shopId, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// Nearby Shops Cache
// ─────────────────────────────────────────────────────────────

/**
 * Get cached nearby shops for a lat/lng position.
 * Snaps coordinates to a 0.01° grid before keying, so users
 * within the same ~1 km cell share one PostGIS query result.
 *
 * On miss, runs the full find_nearby_shops() PostGIS RPC
 * via the injected fetchFn.
 *
 * @param {number}   lat
 * @param {number}   lng
 * @param {Function} fetchFn - async (lat, lng) => shops[]
 * @returns {Array} shops
 */
export async function getCachedNearbyShops(lat, lng, fetchFn) {
  const gridLat = snapToGrid(lat);
  const gridLng = snapToGrid(lng);
  const key     = nearbyKey(gridLat, gridLng);

  try {
    const cached = await cacheGet(key);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      logger.debug('[Cache] HIT nearby', { gridLat, gridLng });
      return parsed;
    }
  } catch (err) {
    logger.warn('[Cache] nearby get error — bypassing cache', { gridLat, gridLng, error: err.message });
  }

  // Cache miss — run PostGIS query
  logger.debug('[Cache] MISS nearby', { gridLat, gridLng });
  const data = await fetchFn(lat, lng);

  try {
    await cacheSet(key, data, TTL_NEARBY_S);
  } catch (err) {
    logger.warn('[Cache] nearby set error', { gridLat, gridLng, error: err.message });
  }

  return data;
}
