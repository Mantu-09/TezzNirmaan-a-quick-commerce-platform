// backend/src/services/sms.service.js — P17-6
// Twilio SMS for order updates (fallback to WhatsApp/push).
// Indian phones: +91 prefix added automatically.
// Graceful no-op if TWILIO_ACCOUNT_SID not set.
import logger from '../utils/logger.js'; // Session Q: use structured logger instead of console.*

let twilio_client = null;

function getClient() {
  if (twilio_client) return twilio_client;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  const twilio = require('twilio');
  twilio_client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return twilio_client;
}

function formatPhone(phone) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('91') && clean.length === 12) return '+' + clean;
  if (clean.length === 10) return '+91' + clean;
  return '+' + clean;
}

/**
 * sendSMS(phone, message)
 * Returns: { sent: true } or { sent: false, reason }
 */
export async function sendSMS(phone, message) {
  const client = getClient();
  if (!client) {
    logger.debug('[SMS] No Twilio config — skipping SMS', { phone, preview: message.slice(0, 60) });
    return { sent: false, reason: 'no_twilio_config' };
  }

  const to   = formatPhone(phone);
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!to || !from) {
    logger.warn('[SMS] Missing phone number or sender', { phone, hasSender: !!from });
    return { sent: false, reason: 'invalid_phone' };
  }

  // Truncate to 160 chars (SMS standard)
  const body = message.slice(0, 160);

  try {
    await client.messages.create({ to, from, body });
    logger.info('[SMS] Sent', { to });
    return { sent: true };
  } catch (err) {
    logger.error('[SMS] Delivery failed', { to, error: err.message });
    return { sent: false, reason: err.message };
  }
}


// ── Pre-built SMS templates ──────────────────────────────────────

export function smsOrderConfirmed(orderNumber, totalRupees) {
  return `TezzNirmaan: Order #${orderNumber} confirmed! Total: Rs.${totalRupees}. Est. delivery: 60-90 min. Track: tezznirmaan.com/track`;
}

export function smsRiderAssigned(riderName, orderNumber) {
  return `TezzNirmaan: ${riderName} is on the way with your Order #${orderNumber}. Track live: tezznirmaan.com/track`;
}

export function smsOrderDelivered(orderNumber) {
  return `TezzNirmaan: Order #${orderNumber} delivered! Thank you. Rate your experience: tezznirmaan.com/orders`;
}

export function smsOrderCancelled(orderNumber, refundRupees) {
  return `TezzNirmaan: Order #${orderNumber} cancelled. ${refundRupees > 0 ? `Refund of Rs.${refundRupees} will be processed in 2-3 days.` : 'No charge was made.'}`;
}

export function smsOTPVerify(otp) {
  return `TezzNirmaan OTP: ${otp}. Valid for 10 minutes. Do not share this code.`;
}
