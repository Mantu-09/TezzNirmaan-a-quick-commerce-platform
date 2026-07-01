import { ORDER_NUMBER_PREFIX, TIER_SUFFIXES } from '../config/constants.js';

// ────────────────────────────────────────────────────────────
// Order Number Generator
//
// Format: TN-YYMMDD-NNNN
// Example: TN-240615-0042
//
// V1: Simple in-memory counter per day. Good enough for the pilot
// where order volume is low. For production scale, upgrade to a
// Postgres SEQUENCE or use the database row count for the day.
// ────────────────────────────────────────────────────────────

let lastDate = '';
let counter = 0;

/**
 * Pad a number to at least `length` digits with leading zeros.
 */
function zeroPad(num, length = 2) {
  return String(num).padStart(length, '0');
}

/**
 * Get today's date as YYMMDD string.
 */
function getDateStamp() {
  const now = new Date();
  const yy = zeroPad(now.getFullYear() % 100);
  const mm = zeroPad(now.getMonth() + 1);
  const dd = zeroPad(now.getDate());
  return `${yy}${mm}${dd}`;
}

/**
 * Generate a unique human-readable order number.
 *
 * @returns {string} e.g. "TN-260701-0001"
 *
 * NOTE: This is NOT concurrency-safe across multiple server instances.
 * For multi-instance deployments, replace with a Postgres SEQUENCE:
 *   SELECT nextval('order_number_seq')
 */
export function generateOrderNumber() {
  const dateStamp = getDateStamp();

  if (dateStamp !== lastDate) {
    lastDate = dateStamp;
    counter = 0;
  }

  counter += 1;

  return `${ORDER_NUMBER_PREFIX}-${dateStamp}-${zeroPad(counter, 4)}`;
}

/**
 * Generate a sub-order number from the parent order number and delivery tier.
 *
 * @param {string} orderNumber  - Parent order number (e.g. "TN-260701-0001")
 * @param {string} deliveryTier - 'quick' or 'scheduled'
 * @returns {string} e.g. "TN-260701-0001-Q" or "TN-260701-0001-S"
 */
export function generateSubOrderNumber(orderNumber, deliveryTier) {
  const suffix = TIER_SUFFIXES[deliveryTier] || deliveryTier.charAt(0).toUpperCase();
  return `${orderNumber}-${suffix}`;
}
