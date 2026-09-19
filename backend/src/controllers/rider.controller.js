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

// ── Session I: Rider Accept Flow ──────────────────────────────────────────────

/** GET /rider/deliveries/offered — returns any pending delivery offer for this rider */
export async function getOfferedDeliveries(req, res, next) {
  try {
    const userId = req.user.id;
    const { data: rider } = await supabaseAdmin
      .from('riders').select('id').eq('profile_id', userId).single();
    if (!rider) return res.json({ success: true, data: { offers: [] } });

    const { data: offers } = await supabaseAdmin
      .from('delivery_assignments')
      .select(`
        id, status, distance_km, offered_at, offer_expires_at,
        sub_orders(
          id, sub_order_number, delivery_tier, total_amount,
          orders(order_number, delivery_address_snapshot),
          order_items(product_name, quantity, unit),
          shops(name, lat, lng, address)
        )
      `)
      .eq('rider_id', rider.id)
      .eq('status', 'offered')
      .eq('is_active', true)
      .gt('offer_expires_at', new Date().toISOString()) // only non-expired
      .order('offered_at', { ascending: false });

    res.json({ success: true, data: { offers: offers || [] } });
  } catch (err) { next(err); }
}

/** POST /rider/deliveries/:assignmentId/decline — rider rejects the offer */
export async function declineDelivery(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;
    const { reason } = req.body;

    const result = await deliveryService.declineDelivery(assignmentId, userId, reason);
    logger.info('Rider declined delivery offer', { assignmentId, userId, reason });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
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
          id, total_amount,
          orders (
            order_number,
            addresses ( street, city, state ),
            payments ( method )
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

    // R3: Flatten payment_method onto sub_order for isCOD check on mobile
    if (data?.sub_orders?.orders?.payments) {
      const pmts = data.sub_orders.orders.payments;
      data.sub_orders.payment_method = Array.isArray(pmts) ? pmts[0]?.method : pmts?.method;
    }

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

// ── P10-4: GET /rider/bank-account ────────────────────────────
// Returns the rider's registered fund account (if any).
// Never returns the full account number — only last4.
export async function getBankAccount(req, res, next) {
  try {
    const riderId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('rider_fund_accounts')
      .select('id, account_name, account_number_last4, ifsc_code, bank_name, is_verified, created_at')
      .eq('rider_id', riderId)
      .maybeSingle();

    if (error) throw error;
    res.json({ success: true, data: { bank_account: data || null } });
  } catch (err) {
    logger.error('GET /rider/bank-account error', { error: err.message });
    next(err);
  }
}

// ── P10-4: POST /rider/bank-account ──────────────────────────
// Registers rider's bank account with RazorpayX and saves to DB.
// Flow: fetch rider profile → createContact → createFundAccount → save
export async function saveBankAccount(req, res, next) {
  try {
    const riderId = req.user.id;
    const { account_name, account_number, ifsc_code, bank_name } = req.body;

    // Validate required fields
    if (!account_name || !account_number || !ifsc_code) {
      return res.status(400).json({
        success: false,
        message: 'account_name, account_number, and ifsc_code are required',
      });
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc_code.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IFSC code format (e.g. SBIN0001234)',
      });
    }

    // Fetch rider profile for RazorpayX contact name + phone
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', riderId)
      .single();

    // Lazy-import service to keep startup fast
    const { registerBankAccount } = await import('../services/razorpay-payout.service.js');

    const row = await registerBankAccount(
      riderId,
      { name: profile?.full_name, phone: profile?.phone },
      { account_name, account_number, ifsc_code, bank_name }
    );

    res.status(201).json({
      success: true,
      message: 'Bank account registered successfully. Earnings will be transferred here.',
      data:    {
        id:                   row.id,
        account_name:         row.account_name,
        account_number_last4: row.account_number_last4,
        ifsc_code:            row.ifsc_code,
        bank_name:            row.bank_name,
        is_verified:          row.is_verified,
      },
    });
  } catch (err) {
    logger.error('POST /rider/bank-account error', { error: err.message });
    next(err);
  }
}

// ── R3: POST /rider/delivery/:assignmentId/collect-cod ────────────────────
// Rider confirms they have collected cash from the customer.
// Only valid for COD orders that have been delivered.
export async function collectCod(req, res, next) {
  try {
    const riderId = req.user.id;
    const { assignmentId } = req.params;

    // 1. Fetch assignment — verify it belongs to this rider and is delivered
    const { data: rider, error: riderErr } = await supabaseAdmin
      .from('riders')
      .select('id')
      .eq('profile_id', riderId)
      .single();

    if (riderErr || !rider) {
      return res.status(404).json({ success: false, message: 'Rider profile not found.' });
    }

    const { data: assignment, error: aErr } = await supabaseAdmin
      .from('delivery_assignments')
      .select('id, rider_id, sub_order_id, status, rider_cash_collected_at')
      .eq('id', assignmentId)
      .single();

    if (aErr || !assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }
    if (assignment.rider_id !== rider.id) {
      return res.status(403).json({ success: false, message: 'Not your assignment.' });
    }
    if (assignment.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: `Cannot collect COD — delivery status is "${assignment.status}". Must be "delivered".`,
      });
    }
    if (assignment.rider_cash_collected_at) {
      return res.json({
        success: true,
        message: 'COD already marked as collected.',
        already_collected: true,
      });
    }

    // 2. Verify it is a COD order via the payments table
    const { data: subOrder, error: soErr } = await supabaseAdmin
      .from('sub_orders')
      .select('id, order_id, total_amount, cod_status')
      .eq('id', assignment.sub_order_id)
      .single();

    if (soErr || !subOrder) {
      return res.status(404).json({ success: false, message: 'Sub-order not found.' });
    }

    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('id, method')
      .eq('order_id', subOrder.order_id)
      .maybeSingle();

    if (!payment || payment.method !== 'cod') {
      return res.status(400).json({
        success: false,
        message: 'This is not a COD order. No cash collection needed.',
      });
    }

    const now = new Date().toISOString();

    // 3. Update delivery_assignments.rider_cash_collected_at
    const { error: daErr } = await supabaseAdmin
      .from('delivery_assignments')
      .update({ rider_cash_collected_at: now })
      .eq('id', assignmentId);

    if (daErr) throw daErr;

    // 4. Update sub_orders.cod_status → collected
    const { error: soUpdateErr } = await supabaseAdmin
      .from('sub_orders')
      .update({ cod_status: 'collected', cod_collected_at: now, updated_at: now })
      .eq('id', subOrder.id);

    if (soUpdateErr) throw soUpdateErr;

    // 5. Update payments.cod_collected_by + cod_collected_at
    const { error: payErr } = await supabaseAdmin
      .from('payments')
      .update({ cod_collected_by: rider.id, cod_collected_at: now })
      .eq('id', payment.id);

    if (payErr) {
      // Non-fatal — payments row update is best-effort (main truth is on sub_orders)
      logger.warn('[collectCod] payments update failed (non-fatal)', { error: payErr.message });
    }

    logger.info('Rider collected COD', { assignmentId, riderId, amount: subOrder.total_amount });

    res.json({
      success: true,
      message: 'Cash collection confirmed. Thank you!',
      data: {
        assignment_id:    assignmentId,
        sub_order_id:     subOrder.id,
        cod_status:       'collected',
        cod_collected_at: now,
        amount_paise:     subOrder.total_amount,
      },
    });
  } catch (err) {
    logger.error('POST /rider/delivery/:assignmentId/collect-cod error', { error: err.message });
    next(err);
  }
}

// ── R3: GET /rider/cod/summary ────────────────────────────────────────────
// Returns total pending cash the rider is holding (collected but not remitted).
export async function getRiderCodSummary(req, res, next) {
  try {
    const riderId = req.user.id;

    const { data: rider, error: riderErr } = await supabaseAdmin
      .from('riders')
      .select('id')
      .eq('profile_id', riderId)
      .single();

    if (riderErr || !rider) {
      return res.status(404).json({ success: false, message: 'Rider profile not found.' });
    }

    // Find all delivery_assignments for this rider that have collected COD
    // Join to sub_orders to get cod_status + amounts
    const { data: assignments, error: aErr } = await supabaseAdmin
      .from('delivery_assignments')
      .select(`
        id, rider_cash_collected_at, status,
        sub_orders (
          id, sub_order_number, total_amount, cod_status, cod_collected_at,
          orders ( order_number, delivery_address_snapshot )
        )
      `)
      .eq('rider_id', rider.id)
      .eq('status', 'delivered')
      .not('rider_cash_collected_at', 'is', null)
      .order('rider_cash_collected_at', { ascending: false });

    if (aErr) throw aErr;

    // Filter: only 'collected' (not yet remitted)
    const collectedRows = (assignments || []).filter(
      a => a.sub_orders?.cod_status === 'collected'
    );

    const totalPaise = collectedRows.reduce(
      (sum, a) => sum + (a.sub_orders?.total_amount || 0), 0
    );

    res.json({
      success: true,
      data: {
        total_cash_held_paise: totalPaise,
        count: collectedRows.length,
        orders: collectedRows.map(a => ({
          assignment_id:        a.id,
          sub_order_id:         a.sub_orders?.id,
          sub_order_number:     a.sub_orders?.sub_order_number,
          order_number:         a.sub_orders?.orders?.order_number,
          amount_paise:         a.sub_orders?.total_amount,
          cod_collected_at:     a.rider_cash_collected_at,
          delivery_address:     a.sub_orders?.orders?.delivery_address_snapshot?.street || '',
        })),
      },
    });
  } catch (err) {
    logger.error('GET /rider/cod/summary error', { error: err.message });
    next(err);
  }
}

// ── Phase G: Rider KYC Onboarding ─────────────────────────────────────────

// POST /rider/kyc/upload-url — get pre-signed R2 URL for a KYC document
export async function getKycUploadUrl(req, res, next) {
  try {
    const { getUploadUrl, isR2Configured } = await import('../services/image.service.js');
    const { AppError } = await import('../utils/errors.js');

    if (!isR2Configured()) {
      // Graceful fallback in dev — return mock URL so mobile onboarding doesn't block
      logger.warn('R2 not configured — returning mock KYC upload URL');
      return res.json({
        success: true,
        data: {
          upload_url: 'https://upload.example.com/mock',
          public_url: `https://cdn.tezznirmaan.in/kyc/mock-${Date.now()}.jpg`,
          key:        `kyc/mock-${Date.now()}`,
        },
      });
    }

    const VALID_DOC_TYPES = [
      'aadhaar_front', 'aadhaar_back', 'pan_card',
      'driving_license', 'vehicle_rc', 'vehicle_insurance',
    ];
    const { doc_type, content_type = 'image/jpeg' } = req.body;
    if (!VALID_DOC_TYPES.includes(doc_type)) {
      throw new AppError(`Invalid doc_type. Must be one of: ${VALID_DOC_TYPES.join(', ')}`, 400);
    }

    const result = await getUploadUrl(`kyc/${req.user.id}`, content_type);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// POST /rider/onboarding/submit — full KYC payload from the 5-step mobile wizard
export async function submitKycOnboarding(req, res, next) {
  try {
    const riderId = req.user.id;
    const { personal, vehicle, documents, bank } = req.body;

    if (!personal?.full_name)              throw new AppError('personal.full_name is required', 400);
    if (!vehicle?.registration_number)     throw new AppError('vehicle.registration_number is required', 400);
    if (!bank?.account_number || !bank?.ifsc_code) throw new AppError('bank account_number and ifsc_code are required', 400);

    // Guard: don't overwrite a completed KYC
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('kyc_complete').eq('id', riderId).single();

    if (profile?.kyc_complete) {
      return res.status(409).json({
        success: false,
        error: { code: 'KYC_ALREADY_COMPLETE', message: 'KYC is already complete for this rider.' },
      });
    }

    // Upsert into rider_kyc table
    const { error: kycErr } = await supabaseAdmin
      .from('rider_kyc')
      .upsert({
        rider_id:              riderId,
        full_name:             personal.full_name,
        dob:                   personal.dob    || null,
        gender:                personal.gender || null,
        vehicle_type:          vehicle.type,
        vehicle_reg_number:    vehicle.registration_number.toUpperCase(),
        vehicle_model:         vehicle.model   || null,
        aadhaar_front_url:     documents?.aadhaar_front     || null,
        aadhaar_back_url:      documents?.aadhaar_back      || null,
        pan_card_url:          documents?.pan_card          || null,
        driving_license_url:   documents?.driving_license   || null,
        vehicle_rc_url:        documents?.vehicle_rc        || null,
        vehicle_insurance_url: documents?.vehicle_insurance || null,
        bank_account_number:   bank.account_number,
        bank_ifsc:             bank.ifsc_code.toUpperCase(),
        bank_holder_name:      bank.account_holder_name || personal.full_name,
        bank_name:             bank.bank_name           || null,
        status:                'pending_review',
        submitted_at:          new Date().toISOString(),
      }, { onConflict: 'rider_id' });

    if (kycErr) throw kycErr;

    // Mark profile: kyc_submitted = true
    await supabaseAdmin.from('profiles')
      .update({ full_name: personal.full_name, kyc_submitted: true, updated_at: new Date().toISOString() })
      .eq('id', riderId);

    logger.info({ riderId }, 'Rider KYC submitted');

    res.status(201).json({
      success: true,
      data: { message: 'KYC submitted. Review takes 24–48 hours.', status: 'pending_review' },
    });
  } catch (err) { next(err); }
}

// GET /rider/kyc/status — check current KYC approval state
export async function getKycStatus(req, res, next) {
  try {
    const riderId = req.user.id;
    const [{ data: kyc }, { data: profile }] = await Promise.all([
      supabaseAdmin.from('rider_kyc')
        .select('status, submitted_at, reviewed_at, rejection_reason')
        .eq('rider_id', riderId).maybeSingle(),
      supabaseAdmin.from('profiles')
        .select('kyc_submitted, kyc_complete').eq('id', riderId).single(),
    ]);

    res.json({
      success: true,
      data: {
        kyc_submitted:    profile?.kyc_submitted  || false,
        kyc_complete:     profile?.kyc_complete   || false,
        status:           kyc?.status             || 'not_submitted',
        submitted_at:     kyc?.submitted_at       || null,
        reviewed_at:      kyc?.reviewed_at        || null,
        rejection_reason: kyc?.rejection_reason   || null,
      },
    });
  } catch (err) { next(err); }
}
