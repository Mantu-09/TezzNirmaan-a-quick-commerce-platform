// ────────────────────────────────────────────────────────────
// Payment Routes
// create-razorpay-order and verify require customer auth.
// webhook is called by Razorpay — NO JWT auth, but signature
// is verified in the controller handler itself.
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import * as c from '../controllers/payment.controller.js';

const router = Router();

// Create a Razorpay order for a placed parent order
router.post('/payments/create-razorpay-order', authenticate, c.createRazorpayOrder);

// Verify Razorpay payment signature after client-side SDK completion
router.post('/payments/verify', authenticate, c.verifyPayment);

// Razorpay webhook — raw body needed for signature verification.
// Note: express.json() must NOT parse this route's body as JSON before
// the signature check. In app.js, add express.raw() for this path BEFORE
// express.json(), or use a dedicated raw body middleware.
router.post('/payments/webhook', c.handleWebhook);

export default router;
