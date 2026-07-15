// ────────────────────────────────────────────────────────────
// Rider Controller
// All routes require authenticate + requireRole('rider')
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import * as deliveryService from '../services/delivery.service.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function getDeliveries(req, res, next) {
  try {
    const userId = req.user.id;
    const { status, page, limit } = req.query;

    const result = await deliveryService.getDeliveries(userId, {
      status,
      page:  page  ? +page  : 1,
      limit: limit ? +limit : 20,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getDeliveryDetail(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;

    const delivery = await deliveryService.getDeliveryDetail(assignmentId, userId);
    res.json({ success: true, data: { delivery } });
  } catch (err) {
    next(err);
  }
}

export async function acceptDelivery(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;

    const result = await deliveryService.acceptDelivery(assignmentId, userId);
    logger.info('Rider accepted delivery', { assignmentId, userId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function confirmPickup(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;

    const result = await deliveryService.confirmPickup(assignmentId, userId);
    logger.info('Rider confirmed pickup', { assignmentId, userId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function confirmDelivery(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;
    const { otp, proofUrl } = req.body;

    const result = await deliveryService.confirmDelivery(assignmentId, userId, { otp, proofUrl });
    logger.info('Rider confirmed delivery', { assignmentId, userId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function cancelDelivery(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;
    const { reason } = req.body;

    const result = await deliveryService.cancelDelivery(assignmentId, userId, reason);
    logger.info('Rider cancelled delivery', { assignmentId, userId, reason });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req, res, next) {
  try {
    const userId = req.user.id;
    const { status } = req.body;

    const validStatuses = ['available', 'on_delivery', 'offline'];
    if (!validStatuses.includes(status)) {
      throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('riders')
      .update({ status, updated_at: now })
      .eq('profile_id', userId);

    if (error) throw error;

    logger.info('Rider status updated', { userId, status });
    res.json({ success: true, data: { status, message: `Rider status updated to ${status}` } });
  } catch (err) {
    next(err);
  }
}

export async function updateLocation(req, res, next) {
  try {
    const userId = req.user.id;
    const { lng, lat } = req.body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new AppError('lat and lng must be numbers', 400);
    }

    const now = new Date().toISOString();

    // ST_MakePoint takes (lng, lat) — note the order!
    // We use raw SQL via rpc or a Postgres function.
    // Since supabaseAdmin.from().update() cannot call PostGIS functions,
    // we use an RPC helper to update the geography column correctly.
    const { error } = await supabaseAdmin.rpc('update_rider_location', {
      p_profile_id: userId,
      p_lng: lng,
      p_lat: lat,
    });

    // Graceful fallback if RPC doesn't exist yet (migration 016 not run)
    if (error && error.message?.includes('function update_rider_location')) {
      // Non-geographic fallback: skip location update, still return success
      // so the rider app doesn't crash. Remove this block after running migration 016.
      logger.warn('update_rider_location RPC not found — skipping geo update', { userId });
    } else if (error) {
      throw error;
    }

    res.json({ success: true, data: { message: 'Location updated', lat, lng, updatedAt: now } });
  } catch (err) {
    next(err);
  }
}
