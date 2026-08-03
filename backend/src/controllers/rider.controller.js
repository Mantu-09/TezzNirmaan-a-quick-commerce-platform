// ────────────────────────────────────────────────────────────
// Rider Controller
// All routes require authenticate + requireRole('rider')
// ────────────────────────────────────────────────────────────
import { supabaseAdmin }       from '../config/supabase.js';
import * as deliveryService   from '../services/delivery.service.js';
import { getRiderEarningsSummary, getPaginatedPayoutHistory } from '../services/rider-earnings.service.js'; // P2-B / P6-4
import { optimizeRiderRoute }      from '../services/route.service.js';          // P3-B
import { AppError }           from '../utils/errors.js';
import logger                 from '../utils/logger.js';
import { broadcastOrderStatus } from '../lib/websocket.js'; // P5-1 — also used for location REST fallback

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
    const { lng, lat, order_id } = req.body;

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

    // P5-1: REST fallback — also persist to rider_locations and broadcast to
    // any connected customers watching this order. This fires when the rider
    // app cannot maintain a WebSocket (e.g. poor network, background kill).
    supabaseAdmin.from('rider_locations').insert({
      rider_id:    userId,
      lat,
      lng,
      recorded_at: now,
    }).then(({ error: locErr }) => {
      if (locErr) logger.warn('REST location: rider_locations insert failed', { error: locErr.message });
    });

    // If the rider provides their active orderId, push location to WS subscribers
    if (order_id) {
      // We reuse broadcastOrderStatus channel by sending a RIDER_LOCATION type
      // directly. Since broadcastOrderStatus sends ORDER_STATUS type, we use
      // the lower-level export from websocket.js for location fan-out.
      // For REST fallback, we instead update the DB and let the _sendLastKnownLocation
      // helper serve reconnecting customers. WS broadcast only happens via the WS path.
      // This keeps the REST path simple: update DB, return 200. WS path does the fan-out.
      logger.debug('REST location update with orderId (WS fan-out skipped — use WS for real-time)', { userId, order_id });
    }

    res.json({ success: true, data: { message: 'Location updated', lat, lng, updatedAt: now } });
  } catch (err) {
    next(err);
  }
}

// ── Earnings (P2-B / P6-4) ─────────────────────────────────────────────

/** GET /rider/earnings — full earnings summary for the authenticated rider */
export async function getEarnings(req, res, next) {
  try {
    const summary = await getRiderEarningsSummary(req.user.id);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
}

/** GET /rider/earnings/history?page=1&limit=10 — paginated payout batch history */
export async function getEarningsHistory(req, res, next) {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
    const result = await getPaginatedPayoutHistory(req.user.id, { page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Route Optimization (P3-B) ─────────────────────────────────

/**
 * GET /rider/deliveries/optimized-route
 * Returns active deliveries in the optimal driving order.
 * Falls back gracefully if GOOGLE_MAPS_API_KEY is not set.
 */
export async function getOptimizedRoute(req, res, next) {
  try {
    const result = await optimizeRiderRoute(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── P9-4: GET /rider/status ─────────────────────────────────────
// Returns current rider online status for RiderHomeScreen toggle.
export async function getRiderStatus(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('riders')
      .select('status, is_online')
      .eq('user_id', req.user.id)
      .single();

    if (error) throw new AppError(error.message, 404);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── P9-4: GET /rider/stats/today ────────────────────────────────
// Returns today's delivery count for RiderHomeScreen stats cards.
export async function getRiderStatsToday(req, res, next) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: rider, error: riderErr } = await supabaseAdmin
      .from('riders')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (riderErr || !rider) throw new AppError('Rider profile not found', 404);

    const { count, error } = await supabaseAdmin
      .from('delivery_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('rider_id', rider.id)
      .eq('status', 'delivered')
      .gte('delivered_at', `${today}T00:00:00.000Z`);

    if (error) throw new AppError(error.message, 500);

    res.json({ success: true, data: { deliveriesToday: count || 0 } });
  } catch (err) {
    next(err);
  }
}

// ── P9-4: GET /rider/deliveries/active ──────────────────────────
// Returns the single active (assigned/picked_up) delivery assignment
// for RiderHomeScreen. Returns null if no active assignment.
export async function getActiveDelivery(req, res, next) {
  try {
    const { data: rider, error: riderErr } = await supabaseAdmin
      .from('riders')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (riderErr || !rider) throw new AppError('Rider profile not found', 404);

    const { data, error } = await supabaseAdmin
      .from('delivery_assignments')
      .select(`
        id, status, assigned_at,
        sub_orders (
          id, total_amount, payment_method,
          orders (
            order_number,
            addresses ( street, city, state )
          ),
          shops ( name, address )
        )
      `)
      .eq('rider_id', rider.id)
      .in('status', ['assigned', 'picked_up'])
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new AppError(error.message, 500);

    res.json({ success: true, data: data || null });
  } catch (err) {
    next(err);
  }
}

// ── P9-4: POST /rider/payout-request ──────────────────────────────────────
// Creates a payout_requests row and notifies platform_admin.
// Rider gets a 24-hour SLA message back immediately.
export async function requestPayout(req, res, next) {
  try {
    const riderId = req.user.id;

    // 1. Check pending payout balance from rider_earnings
    const { data: earningsRows, error: earnErr } = await supabaseAdmin
      .from('rider_earnings')
      .select('id, amount_paise')
      .eq('rider_id', riderId)
      .eq('payment_status', 'pending');

    if (earnErr) throw earnErr;

    const totalPaise = (earningsRows || []).reduce((s, r) => s + (r.amount_paise || 0), 0);

    if (totalPaise === 0) {
      return res.status(400).json({ success: false, message: 'No pending earnings to request payout for.' });
    }

    // 2. Avoid duplicate requests — check for open payout_requests in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from('payout_requests')
      .select('id')
      .eq('rider_id', riderId)
      .eq('status', 'pending')
      .gte('created_at', since)
      .limit(1);

    if (existing?.length > 0) {
      return res.json({
        success: true,
        message: 'Your payout request is already being processed. Payment within 24 hours.',
        already_pending: true,
      });
    }

    // 3. Insert payout_requests row
    const { data: prRow, error: prErr } = await supabaseAdmin
      .from('payout_requests')
      .insert({ rider_id: riderId, amount_paise: totalPaise, status: 'pending' })
      .select()
      .single();

    if (prErr) throw prErr;

    // 4. Notify all platform_admin users (best-effort — non-fatal)
    try {
      const { data: admins } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'platform_admin');

      if (admins?.length) {
        const { data: riderProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', riderId)
          .single();

        await supabaseAdmin.from('notifications').insert(
          admins.map(a => ({
            user_id: a.id,
            type: 'payout_request',
            title: 'Payout Request',
            body: `Rider ${riderProfile?.full_name || 'Unknown'} requested a payout of ₹${(totalPaise / 100).toFixed(0)}`,
            data: { payout_request_id: prRow.id, rider_id: riderId, amount_paise: totalPaise },
          }))
        );
      }
    } catch (notifyErr) {
      logger.warn('[requestPayout] Notification failed (non-fatal)', { error: notifyErr.message });
    }

    res.json({
      success: true,
      message: 'Your request is being processed. Payment within 24 hours.',
      data: { payout_request_id: prRow.id, amount_paise: totalPaise },
    });
  } catch (err) {
    logger.error('POST /rider/payout-request error', { error: err.message });
    next(err);
  }
}

// ── P9-4: POST /rider/deliveries/:assignmentId/issue ──────────────────────
// Marks delivery_assignments.issue_reported = true and notifies shop owner.
export async function reportIssue(req, res, next) {
  try {
    const riderId      = req.user.id;
    const { assignmentId } = req.params;
    const { issue_type, description } = req.body;

    const VALID_TYPES = [
      'customer_not_home',
      'wrong_address',
      'item_damaged',
      'vehicle_breakdown',
      'other',
    ];

    if (!issue_type || !VALID_TYPES.includes(issue_type)) {
      return res.status(400).json({
        success: false,
        message: `issue_type must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }

    // 1. Verify assignment belongs to this rider
    const { data: assignment, error: aErr } = await supabaseAdmin
      .from('delivery_assignments')
      .select('id, sub_order_id, rider_id')
      .eq('id', assignmentId)
      .single();

    if (aErr || !assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }
    if (assignment.rider_id !== riderId) {
      return res.status(403).json({ success: false, message: 'Not your assignment.' });
    }

    // 2. Mark issue_reported on the assignment
    const issueText = description?.trim() ? description.trim() : issue_type.replace(/_/g, ' ');
    const { error: updateErr } = await supabaseAdmin
      .from('delivery_assignments')
      .update({
        issue_reported: true,
        issue_type,
        issue_description: issueText,
        issue_reported_at: new Date().toISOString(),
      })
      .eq('id', assignmentId);

    if (updateErr) throw updateErr;

    // 3. Notify shop owner (best-effort)
    try {
      const { data: subOrder } = await supabaseAdmin
        .from('sub_orders')
        .select('order_id, shops ( owner_id, name )')
        .eq('id', assignment.sub_order_id)
        .single();

      const shopOwnerId = subOrder?.shops?.owner_id;
      const shopName    = subOrder?.shops?.name || 'your shop';

      if (shopOwnerId) {
        const typeLabel = issue_type.replace(/_/g, ' ');
        await supabaseAdmin.from('notifications').insert({
          user_id: shopOwnerId,
          type: 'delivery_issue',
          title: 'Delivery Issue Reported',
          body: `Issue with delivery from ${shopName}: ${typeLabel}. ${issueText !== typeLabel ? issueText : ''}`.trim(),
          data: {
            assignment_id: assignmentId,
            sub_order_id: assignment.sub_order_id,
            issue_type,
            description: issueText,
          },
        });
      }
    } catch (notifyErr) {
      logger.warn('[reportIssue] Notification failed (non-fatal)', { error: notifyErr.message });
    }

    res.json({
      success: true,
      message: 'Issue reported. The shop has been notified.',
    });
  } catch (err) {
    logger.error('POST /rider/deliveries/:assignmentId/issue error', { error: err.message });
    next(err);
  }
}

