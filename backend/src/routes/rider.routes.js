// ────────────────────────────────────────────────────────────
// Rider Routes
// All routes: authenticate + requireRole('rider')
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/rider.controller.js';
import {
  deliveriesQuerySchema,
  confirmDeliverySchema,
  cancelDeliverySchema,
  updateRiderStatusSchema,
  updateLocationSchema,
} from '../validators/rider.validators.js';


const router = Router();
const riderOnly = [authenticate, requireRole('rider')];

// ── Deliveries ────────────────────────────────────────────
// P9-4: Active delivery — single in-flight assignment for RiderHomeScreen
// Must be before /:assignmentId to avoid Express treating 'active' as a param
router.get ('/rider/deliveries/active',                    ...riderOnly, c.getActiveDelivery);
// Session I: Offered deliveries (pending rider accept) — must be before /:assignmentId
router.get ('/rider/deliveries/offered',                   ...riderOnly, c.getOfferedDeliveries);
router.get ('/rider/deliveries',                           ...riderOnly, validate(deliveriesQuerySchema, 'query'), c.getDeliveries);
// P3-B: Must be before /:assignmentId to avoid Express treating 'optimized-route' as a param
router.get ('/rider/deliveries/optimized-route',           ...riderOnly, c.getOptimizedRoute);
router.get ('/rider/deliveries/:assignmentId',             ...riderOnly, c.getDeliveryDetail);
router.post('/rider/deliveries/:assignmentId/accept',      ...riderOnly, c.acceptDelivery);
router.post('/rider/deliveries/:assignmentId/decline',     ...riderOnly, c.declineDelivery); // Session I
router.post('/rider/deliveries/:assignmentId/pickup',      ...riderOnly, c.confirmPickup);
router.post('/rider/deliveries/:assignmentId/deliver',     ...riderOnly, validate(confirmDeliverySchema), c.confirmDelivery);
router.post('/rider/deliveries/:assignmentId/cancel',      ...riderOnly, validate(cancelDeliverySchema), c.cancelDelivery);



// ── Rider Status & Location ───────────────────────────────
// P9-4: GET /rider/status — current online status for RiderHomeScreen
router.get  ('/rider/status',   ...riderOnly, c.getRiderStatus);
router.patch('/rider/status',   ...riderOnly, validate(updateRiderStatusSchema), c.updateStatus);
router.post ('/rider/location', ...riderOnly, validate(updateLocationSchema), c.updateLocation);
// P13-1: PATCH /rider/location — GPS ping every 10s, emits via Socket.IO to order room
router.patch('/rider/location', ...riderOnly, validate(updateLocationSchema), c.updateLocation);

// ── Rider Stats ───────────────────────────────────────────
// P9-4: GET /rider/stats/today — today's delivery count for RiderHomeScreen
router.get('/rider/stats/today', ...riderOnly, c.getRiderStatsToday);

// ── Earnings (P2-B / P6-4) ───────────────────────────────────
router.get('/rider/earnings',         ...riderOnly, c.getEarnings);
// Paginated payout history — separate endpoint for infinite scroll
router.get('/rider/earnings/history', ...riderOnly, c.getEarningsHistory);

// ── P9-4: Payout Request & Issue Reporting ────────────────
router.post('/rider/payout-request',                   ...riderOnly, c.requestPayout);
router.post('/rider/deliveries/:assignmentId/issue',   ...riderOnly, c.reportIssue);

// ── P10-4: Bank Account (RazorpayX fund account) ─────────
// GET  /rider/bank-account — fetch registered account (last4 only, never full number)
// POST /rider/bank-account — register bank account: creates RazorpayX contact + fund account
router.get ('/rider/bank-account', ...riderOnly, c.getBankAccount);
router.post('/rider/bank-account', ...riderOnly, c.saveBankAccount);

// ── R3: COD Collection & Summary ──────────────────────────────────────────
// POST /rider/delivery/:assignmentId/collect-cod — rider confirms cash collected
// NOTE: uses /delivery (singular) to distinguish from /deliveries list routes
router.post('/rider/delivery/:assignmentId/collect-cod', ...riderOnly, c.collectCod);
// GET  /rider/cod/summary — total cash held + list of uncollected amounts
router.get ('/rider/cod/summary',                        ...riderOnly, c.getRiderCodSummary);

// ── P14-6: Rider Earnings Summary (motivational dashboard) ───
// GET /rider/earnings-summary — today, week, month, streak, target
router.get('/rider/earnings-summary', ...riderOnly, async (req, res, next) => {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');
    const riderId = req.user.id;

    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo  = new Date(now - 7  * 86400000).toISOString();
    const monthAgo = new Date(now - 30 * 86400000).toISOString();

    // Fetch earnings rows
    const { data: txns } = await supabaseAdmin
      .from('rider_earnings')
      .select('amount, created_at, type')
      .eq('rider_id', riderId)
      .gte('created_at', monthAgo)
      .order('created_at', { ascending: false });

    const sum = (rows, since) => (rows || [])
      .filter(r => r.created_at >= since && r.type !== 'deduction')
      .reduce((s, r) => s + (r.amount || 0), 0);

    const todayEarnings = sum(txns, today);
    const weekEarnings  = sum(txns, weekAgo);
    const monthEarnings = sum(txns, monthAgo);

    // Delivery count today
    const { count: deliveriesToday } = await supabaseAdmin
      .from('delivery_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('rider_id', riderId)
      .eq('status', 'delivered')
      .gte('updated_at', today);

    // Streak: consecutive days with at least 1 delivery
    let streak = 0;
    for (let d = 0; d < 30; d++) {
      const dayStart = new Date(now - d       * 86400000); dayStart.setHours(0,0,0,0);
      const dayEnd   = new Date(now - (d - 1) * 86400000); dayEnd.setHours(0,0,0,0);
      const { count } = await supabaseAdmin
        .from('delivery_assignments').select('id', { count: 'exact', head: true })
        .eq('rider_id', riderId).eq('status', 'delivered')
        .gte('updated_at', dayStart.toISOString()).lt('updated_at', dayEnd.toISOString());
      if ((count || 0) > 0) streak++;
      else break;
    }

    const dailyTarget = 500 * 100; // Rs.500 in paise — configurable later
    res.json({
      success: true,
      data: {
        today_paise:      todayEarnings,
        week_paise:       weekEarnings,
        month_paise:      monthEarnings,
        deliveries_today: deliveriesToday || 0,
        streak_days:      streak,
        daily_target_paise: dailyTarget,
        target_progress_pct: Math.min(100, Math.round((todayEarnings / dailyTarget) * 100)),
        next_streak_bonus_at: 7, // Every 7-day streak = bonus
      },
    });
  } catch (err) { next(err); }
});

// ── Phase G: Rider KYC Onboarding ────────────────────────────
// POST /rider/kyc/upload-url   — get pre-signed R2 URL for document upload
// POST /rider/onboarding/submit — submit full KYC payload after all steps
// GET  /rider/kyc/status        — check KYC approval status

// IMPORTANT: static paths (/kyc/upload-url, /kyc/status) MUST be declared
// BEFORE /kyc/:docId to prevent Express treating 'upload-url' as a param.
router.post('/rider/kyc/upload-url',    ...riderOnly, c.getKycUploadUrl);
router.get ('/rider/kyc/status',        ...riderOnly, c.getKycStatus);
router.post('/rider/onboarding/submit', ...riderOnly, c.submitKycOnboarding);

export default router;
