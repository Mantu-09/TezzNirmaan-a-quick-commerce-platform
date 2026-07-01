// ────────────────────────────────────────────────────────────
// Money Utilities (Paise ↔ Rupees)
//
// ALL prices in the system are stored and computed in PAISE (integer).
// 1 INR = 100 paise. Never store or compute with rupee floats.
//
// Usage:
//   import { rupeesToPaise, paiseToRupees, calcTax, calcTotal } from '../utils/money.js';
//
//   const price = rupeesToPaise(38.50);  // → 3850
//   const display = paiseToRupees(3850); // → 38.5 (for display only)
// ────────────────────────────────────────────────────────────

/**
 * Convert rupees (float) to paise (integer).
 * Rounds to nearest paisa to handle floating-point representation errors.
 * @param {number} rupees
 * @returns {number} integer paise
 */
export function rupeesToPaise(rupees) {
  return Math.round(rupees * 100);
}

/**
 * Convert paise (integer) to rupees for display only.
 * Never use the result in further arithmetic — convert back to paise first.
 * @param {number} paise
 * @returns {number} rupees with 2 decimal places
 */
export function paiseToRupees(paise) {
  return paise / 100;
}

/**
 * Format paise as an INR display string: e.g. 3850 → "₹38.50"
 * @param {number} paise
 * @returns {string}
 */
export function formatPaise(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

/**
 * Calculate GST amount in paise.
 * tax = Math.round(subtotal_paise * gst_percent / 100)
 * Integer arithmetic avoids floating-point errors.
 * @param {number} subtotalPaise - base amount in paise
 * @param {number} gstPercent - e.g. 18 for 18%
 * @returns {number} tax amount in paise
 */
export function calcTaxPaise(subtotalPaise, gstPercent) {
  // Use integer arithmetic: multiply first, then divide
  return Math.round((subtotalPaise * gstPercent) / 100);
}

/**
 * Calculate the total price for a line item (quantity × unit_price + tax).
 * All values in paise.
 *
 * @param {number} quantity      - can be fractional (e.g. 2.5 kg)
 * @param {number} unitPricePaise - price per unit in paise
 * @param {number} gstPercent    - e.g. 18
 * @returns {{ subtotalPaise, taxPaise, totalPaise }}
 */
export function calcLineItem(quantity, unitPricePaise, gstPercent) {
  // Use Math.round to avoid floating-point issues with fractional quantities
  const subtotalPaise = Math.round(quantity * unitPricePaise);
  const taxPaise      = calcTaxPaise(subtotalPaise, gstPercent);
  const totalPaise    = subtotalPaise + taxPaise;
  return { subtotalPaise, taxPaise, totalPaise };
}

/**
 * Delivery fee schedule (flat rates in paise for V1).
 * Can be upgraded to distance-based pricing later.
 */
export const DELIVERY_FEES_PAISE = Object.freeze({
  quick:     4000,   // ₹40 for quick delivery
  scheduled: 10000,  // ₹100 for scheduled delivery (tempo/loader)
  free_above_paise: {
    quick:     50000,  // free quick delivery above ₹500
    scheduled: 200000, // free scheduled delivery above ₹2000
  },
});

/**
 * Compute delivery fee for a tier given the subtotal.
 * @param {'quick'|'scheduled'} tier
 * @param {number} subtotalPaise
 * @returns {number} delivery fee in paise (0 if free)
 */
export function calcDeliveryFee(tier, subtotalPaise) {
  const freeAbove = DELIVERY_FEES_PAISE.free_above_paise[tier];
  if (subtotalPaise >= freeAbove) return 0;
  return DELIVERY_FEES_PAISE[tier];
}
