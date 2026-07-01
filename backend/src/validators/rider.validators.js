import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// Rider Endpoint Validators (Zod Schemas)
// ────────────────────────────────────────────────────────────

/** GET /rider/deliveries?status=active|completed */
export const deliveriesQuerySchema = z.object({
  status: z.enum(['active', 'completed']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** POST /rider/deliveries/:assignmentId/deliver — confirm delivery */
export const confirmDeliverySchema = z.object({
  otp: z.string().min(4).max(6).optional(),
  proofUrl: z.string().url().optional(),
});

/** POST /rider/deliveries/:assignmentId/cancel — cancel delivery */
export const cancelDeliverySchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').max(500),
});

/** PATCH /rider/status — update availability */
export const updateRiderStatusSchema = z.object({
  status: z.enum(['available', 'on_delivery', 'offline']),
});

/** POST /rider/location — update current location */
export const updateLocationSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

/** Common assignment ID param */
export const assignmentIdParamSchema = z.object({
  assignmentId: z.string().uuid(),
});
