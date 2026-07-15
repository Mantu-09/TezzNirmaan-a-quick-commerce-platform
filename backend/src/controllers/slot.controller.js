// ────────────────────────────────────────────────────────────
// Slot Controller — B6
// ────────────────────────────────────────────────────────────
import * as slotService from '../services/slot.service.js';

// ── Customer ──────────────────────────────────────────────────

/**
 * GET /customer/shops/:shopId/slots?date=YYYY-MM-DD&tier=scheduled
 * Public — no auth required. Returns available slots for a shop+date.
 * Only useful for 'scheduled' tier but we accept tier as future filter.
 */
export async function getAvailableSlots(req, res, next) {
  try {
    const { shopId } = req.params;
    const { date }   = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date query param required (YYYY-MM-DD)' });
    }

    // Only show slots for today onwards
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      return res.status(400).json({ success: false, message: 'date must be today or in the future' });
    }

    const slots = await slotService.getAvailableSlots(shopId, date);
    res.json({ success: true, data: { slots, date } });
  } catch (err) {
    next(err);
  }
}

// ── Shop Dashboard ────────────────────────────────────────────

/**
 * GET /shop/slots/templates
 * Returns all slot templates for this shop (all days, active + inactive).
 */
export async function getSlotTemplates(req, res, next) {
  try {
    const templates = await slotService.getSlotTemplates(req.shopId);
    res.json({ success: true, data: { templates } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /shop/slots/templates
 * Body: { day_of_week, start_time, end_time, max_orders }
 */
export async function createSlotTemplate(req, res, next) {
  try {
    const { day_of_week, start_time, end_time, max_orders = 10 } = req.body;

    if (day_of_week == null || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: 'day_of_week, start_time and end_time are required' });
    }
    if (start_time >= end_time) {
      return res.status(400).json({ success: false, message: 'start_time must be before end_time' });
    }

    const template = await slotService.createSlotTemplate(req.shopId, {
      dayOfWeek:  +day_of_week,
      startTime:  start_time,
      endTime:    end_time,
      maxOrders:  +max_orders,
    });

    res.status(201).json({ success: true, data: { template } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /shop/slots/templates/:templateId
 * Body: { max_orders?, is_active? }
 */
export async function updateSlotTemplate(req, res, next) {
  try {
    const { templateId } = req.params;
    const { max_orders, is_active } = req.body;

    const template = await slotService.updateSlotTemplate(req.shopId, templateId, {
      maxOrders: max_orders,
      isActive:  is_active,
    });

    res.json({ success: true, data: { template } });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /shop/slots/templates/:templateId
 * Soft-disables if future bookings exist, hard-deletes otherwise.
 */
export async function deleteSlotTemplate(req, res, next) {
  try {
    const { templateId } = req.params;
    const result = await slotService.deleteSlotTemplate(req.shopId, templateId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /shop/slots/bookings?date=YYYY-MM-DD
 * Returns all bookings for the shop on a date, grouped by time slot.
 */
export async function getSlotBookings(req, res, next) {
  try {
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date query param required (YYYY-MM-DD)' });
    }

    const bookings = await slotService.getSlotBookings(req.shopId, date);
    res.json({ success: true, data: { bookings, date } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /shop/slots/templates/seed-defaults
 * Seeds Mon–Sat 8am–8pm 3-hour slots for a shop that has no templates yet.
 */
export async function seedDefaultSlots(req, res, next) {
  try {
    await slotService.seedDefaultSlots(req.shopId);
    const templates = await slotService.getSlotTemplates(req.shopId);
    res.json({ success: true, data: { templates, message: 'Default slots seeded' } });
  } catch (err) {
    next(err);
  }
}
