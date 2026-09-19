// ────────────────────────────────────────────────────────────
// whatsapp.service.js — P13-2
//
// WhatsApp Business Messaging via WATI.io
// India's most effective notification channel (98% open rate).
//
// Provider: WATI.io (official WhatsApp BSP)
// Cost:     ~Rs.0.40/message on cheapest plan
// Alt:      Meta Cloud API (free up to 1000/month)
//
// Environment Variables:
//   WATI_API_URL   — e.g. https://live-server-1234.wati.io
//   WATI_API_TOKEN — Bearer token from WATI dashboard
//
// Templates (must be pre-approved in WATI dashboard):
//   order_confirmed  — params: [order_number, items_summary, total]
//   rider_assigned   — params: [rider_name, order_number, track_url]
//   order_delivered  — params: [order_number, rate_url, refer_url]
//   order_cancelled  — params: [order_number, refund_amount]
//
// If WATI_API_URL or WATI_API_TOKEN is not set, all calls are
// no-ops that log a warning. This keeps development safe.
// ────────────────────────────────────────────────────────────
import logger from '../utils/logger.js';

const WATI_URL   = process.env.WATI_API_URL;
const WATI_TOKEN = process.env.WATI_API_TOKEN;
const APP_URL    = process.env.APP_URL || 'https://tezznirmaan.in';

// Internal: send a WATI template message
async function sendTemplateMessage(phone, templateName, parameters = []) {
  if (!WATI_URL || !WATI_TOKEN) {
    logger.warn(`WhatsApp: WATI not configured — skipping template "${templateName}" to ${phone}`);
    return { skipped: true };
  }

  // Normalize phone: ensure 91XXXXXXXXXX format (no +)
  const normalizedPhone = phone.replace(/\D/g, '').replace(/^0/, '').replace(/^91/, '');
  const waPhone = `91${normalizedPhone}`;

  try {
    const body = {
      template_name: templateName,
      broadcast_name: `tn_${templateName}_${Date.now()}`,
      parameters: parameters.map((value, index) => ({
        name:  String(index + 1),
        value: String(value),
      })),
    };

    const res = await fetch(`${WATI_URL}/api/v1/sendTemplateMessage?whatsappNumber=${waPhone}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${WATI_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      logger.warn('WhatsApp: WATI API error', {
        phone: waPhone, template: templateName, status: res.status, response: json,
      });
      return { success: false, error: json };
    }

    logger.info('WhatsApp: message sent', { phone: waPhone, template: templateName });
    return { success: true, data: json };

  } catch (err) {
    logger.error('WhatsApp: network error', { phone: waPhone, template: templateName, error: err.message });
    return { success: false, error: err.message };
  }
}

// Public helpers — called from order-lifecycle.service.js

/** Order confirmed — status -> confirmed */
export async function notifyOrderConfirmedWA(phone, orderNumber, itemsSummary, totalRupees) {
  return sendTemplateMessage(phone, 'order_confirmed', [orderNumber, itemsSummary, `Rs.${totalRupees}`]);
}

/** Rider assigned — rider accepted delivery assignment */
export async function notifyRiderAssignedWA(phone, riderName, orderNumber) {
  const trackUrl = `${APP_URL}/track?num=${orderNumber}`;
  return sendTemplateMessage(phone, 'rider_assigned', [riderName || 'Your rider', orderNumber, trackUrl]);
}

/** Order delivered — sub_order status -> delivered */
export async function notifyOrderDeliveredWA(phone, orderNumber) {
  const rateUrl  = `${APP_URL}/orders`;
  const referUrl = `${APP_URL}/referral`;
  return sendTemplateMessage(phone, 'order_delivered', [orderNumber, rateUrl, referUrl]);
}

/** Order cancelled — order/sub_order -> cancelled */
export async function notifyOrderCancelledWA(phone, orderNumber, refundRupees) {
  const refundText = refundRupees > 0 ? `Rs.${refundRupees}` : 'applicable amount';
  return sendTemplateMessage(phone, 'order_cancelled', [orderNumber, refundText]);
}
