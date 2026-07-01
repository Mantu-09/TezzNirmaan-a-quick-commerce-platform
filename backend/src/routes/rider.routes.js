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
router.get ('/rider/deliveries',                        ...riderOnly, validate(deliveriesQuerySchema, 'query'), c.getDeliveries);
router.get ('/rider/deliveries/:assignmentId',          ...riderOnly, c.getDeliveryDetail);
router.post('/rider/deliveries/:assignmentId/accept',   ...riderOnly, c.acceptDelivery);
router.post('/rider/deliveries/:assignmentId/pickup',   ...riderOnly, c.confirmPickup);
router.post('/rider/deliveries/:assignmentId/deliver',  ...riderOnly, validate(confirmDeliverySchema), c.confirmDelivery);
router.post('/rider/deliveries/:assignmentId/cancel',   ...riderOnly, validate(cancelDeliverySchema), c.cancelDelivery);

// ── Rider Status & Location ───────────────────────────────
router.patch('/rider/status',   ...riderOnly, validate(updateRiderStatusSchema), c.updateStatus);
router.post ('/rider/location', ...riderOnly, validate(updateLocationSchema), c.updateLocation);

export default router;
