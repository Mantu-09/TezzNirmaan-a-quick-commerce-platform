// ────────────────────────────────────────────────────────────
// SMS Service — Fast2SMS Integration
//
// Choice: Fast2SMS (https://www.fast2sms.com)
//   ✅ Indian gateway — no DLT registration required for transactional
//      messages sent via Route 4 (transactional, OTP route)
//   ✅ Free tier: 500 SMS on signup
//   ✅ Simple REST API, no SDK needed
//   ✅ Delivery reports available
//   ❌ Not suitable for bulk marketing (use MSG91 or Exotel for that)
//
// Set FAST2SMS_API_KEY in your .env file.
// Get your API key from: https://www.fast2sms.com/dashboard/api-credentials
//
// Fail-silently contract:
//   send() and sendBulk() NEVER throw. On failure, they log and return false.
//   This means an SMS failure can never crash an order flow.
// ────────────────────────────────────────────────────────────
import logger from '../utils/logger.js';

const API_KEY  = process.env.FAST2SMS_API_KEY;
const BASE_URL = 'https://www.fast2sms.com/dev/bulkV2';

/**
 * Normalise Indian phone number to 10-digit format.
 * Fast2SMS accepts 10-digit numbers without country code.
 */
function normalisePhone(phone) {
  if (!phone) return null;
  // Strip +91, 91 prefix, spaces, dashes
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

/**
 * Send a single SMS message.
 *
 * @param {string} phone   - Phone number (any Indian format: +91XXXXXXXXXX, 91XXXXXXXXXX, XXXXXXXXXX)
 * @param {string} message - Message body (max 160 chars for single SMS)
 * @returns {Promise<boolean>} true on success, false on failure
 */
export async function send(phone, message) {
  if (!API_KEY) {
    logger.warn('SMS skipped: FAST2SMS_API_KEY not set in environment', { phone });
    return false;
  }

  const normalised = normalisePhone(phone);
  if (!normalised) {
    logger.warn('SMS skipped: invalid phone number format', { phone });
    return false;
  }

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        authorization: API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route:   'q',          // Quick/Transactional route (no DLT required)
        numbers: normalised,
        message,
        flash:   0,            // 0 = normal SMS, 1 = flash SMS (no storage on device)
      }),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json.return === false) {
      logger.error('Fast2SMS send failed', {
        phone: normalised,
        status: response.status,
        response: json,
      });
      return false;
    }

    logger.info('SMS sent', { phone: normalised, requestId: json.request_id });
    return true;
  } catch (err) {
    // Network error — log but never throw
    logger.error('Fast2SMS network error', { phone: normalised, error: err.message });
    return false;
  }
}

/**
 * Send the same message to multiple phone numbers.
 * Fast2SMS supports comma-separated numbers in one API call.
 *
 * @param {string[]} phones  - Array of phone numbers
 * @param {string}   message - Message body
 * @returns {Promise<boolean>}
 */
export async function sendBulk(phones, message) {
  if (!API_KEY) {
    logger.warn('Bulk SMS skipped: FAST2SMS_API_KEY not set');
    return false;
  }

  const normalised = phones
    .map(normalisePhone)
    .filter(Boolean)
    .join(',');

  if (!normalised) {
    logger.warn('Bulk SMS skipped: no valid phone numbers');
    return false;
  }

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        authorization: API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route:   'q',
        numbers: normalised,
        message,
        flash:   0,
      }),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json.return === false) {
      logger.error('Fast2SMS bulk send failed', { count: phones.length, response: json });
      return false;
    }

    logger.info('Bulk SMS sent', { count: phones.length, requestId: json.request_id });
    return true;
  } catch (err) {
    logger.error('Fast2SMS bulk network error', { error: err.message });
    return false;
  }
}
