import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// Payment Endpoint Validators (Zod Schemas)
// ────────────────────────────────────────────────────────────

/** POST /payments/create-razorpay-order */
export const createRazorpayOrderSchema = z.object({
  orderId: z.string().uuid('Valid order ID is required'),
});

/** POST /payments/verify */
export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1, 'Razorpay order ID is required'),
  razorpayPaymentId: z.string().min(1, 'Razorpay payment ID is required'),
  razorpaySignature: z.string().min(1, 'Razorpay signature is required'),
});

/**
 * Webhook body — Razorpay sends a JSON payload.
 * We don't strictly validate the body shape here because the
 * webhook handler verifies the signature first. This schema
 * does a minimal structural check.
 */
export const webhookBodySchema = z.object({
  event: z.string(),
  payload: z.object({}).passthrough(),
}).passthrough();
