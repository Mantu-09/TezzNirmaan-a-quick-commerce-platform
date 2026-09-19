// ────────────────────────────────────────────────────────────
// Order Number Generator — V2 (Session H — P3 fix)
//
// Format:  TN-YYMMDD-NNNNNN
// Example: TN-260906-001042
//
// V2: Uses a Postgres SEQUENCE (order_number_seq) via the
// generate_order_number() DB function. Safe across multiple
// server instances, process restarts, and concurrent requests.
//
// V1 used an in-memory counter that reset on restart and was
// not safe for multi-instance deployments. See migration 083.
// ────────────────────────────────────────────────────────────
import { TIER_SUFFIXES } from '../config/constants.js';
import { supabaseAdmin } from '../config/supabase.js';
import logger from './logger.js';

/**
 * Generate a unique human-readable order number using a Postgres SEQUENCE.
 * Safe for multi-instance deployments and server restarts.
 *
 * @returns {Promise<string>} e.g. "TN-260906-001042"
 */
export async function generateOrderNumber() {
  const { data, error } = await supabaseAdmin.rpc('generate_order_number');
  if (error) {
    // If the DB function fails (e.g. migration not yet applied), fall back
    // to a timestamp+random suffix — still unique enough for the short term.
    logger.error('generate_order_number RPC failed — using fallback', { error: error.message });
    const now = new Date();
    const yy  = String(now.getFullYear() % 100).padStart(2, '0');
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    const dd  = String(now.getDate()).padStart(2, '0');
    const rnd = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `TN-${yy}${mm}${dd}-F${rnd}`; // 'F' prefix = fallback, easy to spot
  }
  return data;
}

/**
 * Generate a sub-order number from the parent order number and delivery tier.
 *
 * @param {string} orderNumber  - Parent order number (e.g. "TN-260906-001042")
 * @param {string} deliveryTier - 'quick' or 'scheduled'
 * @returns {string} e.g. "TN-260906-001042-Q"
 */
export function generateSubOrderNumber(orderNumber, deliveryTier) {
  const suffix = TIER_SUFFIXES[deliveryTier] || deliveryTier.charAt(0).toUpperCase();
  return `${orderNumber}-${suffix}`;
}
