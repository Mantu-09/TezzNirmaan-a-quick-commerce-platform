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
router.get ('/rider/deliveries',                           ...riderOnly, validate(deliveriesQuerySchema, 'query'), c.getDeliveries);
// P3-B: Must be before /:assignmentId to avoid Express treating 'optimized-route' as a param
router.get ('/rider/deliveries/optimized-route',           ...riderOnly, c.getOptimizedRoute);
router.get ('/rider/deliveries/:assignmentId',             ...riderOnly, c.getDeliveryDetail);
router.post('/rider/deliveries/:assignmentId/accept',      ...riderOnly, c.acceptDelivery);
router.post('/rider/deliveries/:assignmentId/pickup',      ...riderOnly, c.confirmPickup);
router.post('/rider/deliveries/:assignmentId/deliver',     ...riderOnly, validate(confirmDeliverySchema), c.confirmDelivery);
router.post('/rider/deliveries/:assignmentId/cancel',      ...riderOnly, validate(cancelDeliverySchema), c.cancelDelivery);


// ── Rider Status & Location ───────────────────────────────
// P9-4: GET /rider/status — current online status for RiderHomeScreen
router.get  ('/rider/status',   ...riderOnly, c.getRiderStatus);
router.patch('/rider/status',   ...riderOnly, validate(updateRiderStatusSchema), c.updateStatus);
router.post ('/rider/location', ...riderOnly, validate(updateLocationSchema), c.updateLocation);

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

export default router;

