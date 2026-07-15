// ────────────────────────────────────────────────────────────
// Slot Service — B6
//
// Handles delivery slot templates and bookings.
// All queries go through supabaseAdmin (service role), which
// bypasses RLS for internal operations — RLS still protects
// direct PostgREST calls from clients.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { cacheGet, cacheSet, cacheDel } from '../config/redis.js'; // B7

// ── Customer: Available Slots ────────────────────────────────

/**
 * Get available slots for a shop on a specific date.
 * Uses the get_available_slots RPC for atomic booking-count join.
 *
 * @param {string} shopId
 * @param {string} date  — ISO date string 'YYYY-MM-DD'
 * @returns {Array} slots with template_id, start_time, end_time, booking_count, available, label
 */
export async function getAvailableSlots(shopId, date) {
  // B7: Cache slot availability for 30 seconds.
  // Short TTL because slots fill up during peak hours and stale data
  // causes customers to select a full slot.
  const cacheKey = `slots:${shopId}:${date}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fall through */ }
  }

  const { data, error } = await supabaseAdmin
    .rpc('get_available_slots', { p_shop_id: shopId, p_date: date });

  if (error) {
    logger.error('getAvailableSlots RPC error', { error: error.message, shopId, date });
    throw new AppError('Could not fetch available slots', 500);
  }

  const result = data || [];
  await cacheSet(cacheKey, result, 30); // 30s TTL
  return result;
}

// ── Shop: Template CRUD ───────────────────────────────────────

/**
 * Get all slot templates for a shop (all days, active + inactive).
 */
export async function getSlotTemplates(shopId) {
  const { data, error } = await supabaseAdmin
    .from('delivery_slot_templates')
    .select('id, day_of_week, start_time, end_time, max_orders, is_active, created_at')
    .eq('shop_id', shopId)
    .order('day_of_week')
    .order('start_time');

  if (error) throw error;
  return data || [];
}

/**
 * Create a new slot template.
 * Validates no time overlap with existing active templates for same shop+day.
 */
export async function createSlotTemplate(shopId, { dayOfWeek, startTime, endTime, maxOrders }) {
  // Check for overlap with existing active templates on same day
  const { data: existing } = await supabaseAdmin
    .from('delivery_slot_templates')
    .select('id, start_time, end_time')
    .eq('shop_id', shopId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true);

  const hasOverlap = (existing || []).some(t => {
    // Overlap: new start < existing end AND new end > existing start
    return startTime < t.end_time && endTime > t.start_time;
  });

  if (hasOverlap) {
    throw new AppError('This slot overlaps with an existing active slot for this day', 400, 'slot_overlap');
  }

  const { data, error } = await supabaseAdmin
    .from('delivery_slot_templates')
    .insert({
      shop_id:     shopId,
      day_of_week: dayOfWeek,
      start_time:  startTime,
      end_time:    endTime,
      max_orders:  maxOrders,
      is_active:   true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new AppError('A slot with this exact time window already exists', 409);
    throw error;
  }
  return data;
}

/**
 * Update an existing slot template (max_orders, is_active).
 * Does NOT allow changing start/end time — delete and recreate instead.
 */
export async function updateSlotTemplate(shopId, templateId, { maxOrders, isActive }) {
  const updates = {};
  if (maxOrders != null) updates.max_orders = +maxOrders;
  if (isActive  != null) updates.is_active  = !!isActive;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('delivery_slot_templates')
    .update(updates)
    .eq('id', templateId)
    .eq('shop_id', shopId)          // ownership guard
    .select()
    .single();

  if (error) throw error;
  if (!data)  throw new NotFoundError('Slot template not found');
  return data;
}

/**
 * Delete a slot template. Fails if there are future bookings using this slot.
 */
export async function deleteSlotTemplate(shopId, templateId) {
  // Fetch the template first to get times
  const { data: tmpl } = await supabaseAdmin
    .from('delivery_slot_templates')
    .select('start_time, end_time, day_of_week')
    .eq('id', templateId)
    .eq('shop_id', shopId)
    .single();

  if (!tmpl) throw new NotFoundError('Slot template not found');

  // Check for future bookings (today or later)
  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabaseAdmin
    .from('delivery_slot_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('slot_start', tmpl.start_time)
    .eq('slot_end',   tmpl.end_time)
    .gte('slot_date', today);

  if ((count || 0) > 0) {
    // Soft-disable instead of hard delete
    await supabaseAdmin
      .from('delivery_slot_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', templateId);
    return { deleted: false, deactivated: true, futurBookings: count };
  }

  const { error } = await supabaseAdmin
    .from('delivery_slot_templates')
    .delete()
    .eq('id', templateId)
    .eq('shop_id', shopId);

  if (error) throw error;
  return { deleted: true };
}

// ── Shop: Bookings ────────────────────────────────────────────

/**
 * Get all bookings for a shop on a given date, with sub_order info.
 * Used by the dashboard "Slots" day view.
 */
export async function getSlotBookings(shopId, date) {
  const { data, error } = await supabaseAdmin
    .from('delivery_slot_bookings')
    .select(`
      id, slot_date, slot_start, slot_end, created_at,
      sub_orders!inner(
        id, sub_order_number, status, total_amount,
        orders!inner(order_number, profiles!customer_id(full_name, phone))
      )
    `)
    .eq('shop_id', shopId)
    .eq('slot_date', date)
    .order('slot_start')
    .order('created_at');

  if (error) {
    logger.error('getSlotBookings error', { error: error.message });
    throw error;
  }

  // Group by time slot for the dashboard day view
  const grouped = new Map();
  for (const booking of (data || [])) {
    const key = `${booking.slot_start}|${booking.slot_end}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        slotStart:    booking.slot_start,
        slotEnd:      booking.slot_end,
        bookings:     [],
      });
    }
    grouped.get(key).bookings.push({
      bookingId:   booking.id,
      subOrderId:  booking.sub_orders?.id,
      subOrderNum: booking.sub_orders?.sub_order_number,
      status:      booking.sub_orders?.status,
      totalAmount: booking.sub_orders?.total_amount,
      customer:    booking.sub_orders?.orders?.profiles?.full_name,
      phone:       booking.sub_orders?.orders?.profiles?.phone,
      orderNum:    booking.sub_orders?.orders?.order_number,
    });
  }

  return Array.from(grouped.values());
}

/**
 * Create a booking for a sub_order.
 * Called by order.service when a scheduled sub_order is placed.
 * Will not fail order placement if slot is already full — just skips booking
 * and logs a warning (prevents hard blocking).
 */
export async function bookSlot(shopId, subOrderId, { slotDate, slotStart, slotEnd }) {
  const { data, error } = await supabaseAdmin
    .from('delivery_slot_bookings')
    .insert({ shop_id: shopId, sub_order_id: subOrderId, slot_date: slotDate, slot_start: slotStart, slot_end: slotEnd })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      logger.warn('bookSlot: sub_order already has a booking', { subOrderId });
      return null;
    }
    logger.error('bookSlot insert error', { error: error.message });
    return null; // Non-fatal
  }

  // B7: Invalidate the slot availability cache so the next customer sees
  // the updated booking count immediately, not stale data within the 30s window.
  await cacheDel(`slots:${shopId}:${slotDate}`);

  return data;
}


// ── Seed helper: create default daily slots ───────────────────
/**
 * Seed a shop with default 8am–8pm slots in 3-hour windows, Mon–Sat.
 * Called from createShop if shop owner hasn't configured slots yet.
 */
export async function seedDefaultSlots(shopId) {
  const DAY_WINDOWS = [
    { start: '08:00', end: '11:00' },
    { start: '11:00', end: '14:00' },
    { start: '14:00', end: '17:00' },
    { start: '17:00', end: '20:00' },
  ];

  const rows = [];
  for (let dow = 1; dow <= 6; dow++) { // Mon=1 … Sat=6 (skip Sun=0)
    for (const w of DAY_WINDOWS) {
      rows.push({
        shop_id:     shopId,
        day_of_week: dow,
        start_time:  w.start,
        end_time:    w.end,
        max_orders:  10,
        is_active:   true,
      });
    }
  }

  const { error } = await supabaseAdmin
    .from('delivery_slot_templates')
    .upsert(rows, { onConflict: 'shop_id,day_of_week,start_time,end_time', ignoreDuplicates: true });

  if (error) logger.warn('seedDefaultSlots error (non-fatal)', { error: error.message });
}
