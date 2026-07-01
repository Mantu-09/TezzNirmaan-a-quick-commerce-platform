import Razorpay from 'razorpay';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  throw new Error(
    'Missing Razorpay environment variables. Check RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET in .env'
  );
}

/**
 * Configured Razorpay instance.
 * Used for creating orders, verifying payments, and handling refunds.
 */
export const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});
