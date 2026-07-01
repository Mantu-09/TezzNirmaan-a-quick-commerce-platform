// Money utilities for mobile app
// All API values are in PAISE (bigint). These helpers convert for display only.

/**
 * Format paise as ₹XX.XX string
 * e.g. 3850 → "₹38.50"
 */
export function formatPaise(paise) {
  if (paise == null || isNaN(paise)) return '₹0';
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format paise as compact string for large amounts
 * e.g. 320000 → "₹3,200"
 */
export function formatPaiseCompact(paise) {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000)   return `₹${(rupees / 1000).toFixed(1)}K`;
  return formatPaise(paise);
}

/**
 * Calculate discount percentage between MRP and selling price
 * e.g. mrp=75000, price=68000 → "9% off"
 */
export function discountPercent(pricePaise, mrpPaise) {
  if (!mrpPaise || mrpPaise <= pricePaise) return null;
  const pct = Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
  return pct > 0 ? `${pct}% off` : null;
}

/**
 * Savings amount
 * e.g. mrp=75000, price=68000 → "Save ₹70"
 */
export function savingsAmount(pricePaise, mrpPaise) {
  if (!mrpPaise || mrpPaise <= pricePaise) return null;
  return `Save ${formatPaise(mrpPaise - pricePaise)}`;
}
