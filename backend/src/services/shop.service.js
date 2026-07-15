// ────────────────────────────────────────────────────────────
// Shop Service
// CRUD operations for the shops table.
// Used by shop.controller.js for settings endpoints.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { NotFoundError } from '../utils/errors.js';

const SHOP_PUBLIC_FIELDS = `
  id, name, slug, description, phone, email,
  address_line1, address_line2, city, state, pincode,
  quick_delivery_radius_km, scheduled_delivery_radius_km,
  is_active, is_accepting_orders,
  operating_hours, logo_url,
  created_at, updated_at
`;

/**
 * Get a shop by its ID.
 * @param {string} shopId
 * @returns {object} shop record
 */
export async function getShopById(shopId) {
  const { data, error } = await supabaseAdmin
    .from('shops')
    .select(SHOP_PUBLIC_FIELDS)
    .eq('id', shopId)
    .single();

  if (error || !data) throw new NotFoundError('Shop not found');
  return data;
}

/**
 * Update allowed shop fields.
 * Only whitelisted fields are written — prevents mass-assignment vulnerabilities.
 *
 * @param {string} shopId
 * @param {object} updates - raw update object (snake_case from request body)
 * @returns {object} updated shop record
 */
export async function updateShop(shopId, updates) {
  // Whitelist: only allow these fields to be updated by shop owners
  const allowed = [
    'name', 'description', 'phone', 'email',
    'address_line1', 'address_line2', 'city', 'state', 'pincode',
    'quick_delivery_radius_km', 'scheduled_delivery_radius_km',
    'operating_hours', 'logo_url',
    'is_accepting_orders',  // toggled directly via toggleOrders or updateShop
  ];

  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  if (Object.keys(safeUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }

  safeUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('shops')
    .update(safeUpdates)
    .eq('id', shopId)
    .select(SHOP_PUBLIC_FIELDS)
    .single();

  if (error) throw error;
  if (!data) throw new NotFoundError('Shop not found');
  return data;
}
