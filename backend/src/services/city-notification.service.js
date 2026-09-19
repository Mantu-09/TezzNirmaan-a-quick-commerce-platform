// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// City Notification Service â€” P4-4A + P5-6
//
// Two responsibilities:
//
//   1. notifyCityActivation(city) â€” internal Slack/webhook alert
//      when an admin activates a city via the dashboard.
//
//   2. notifyWaitlist(cityId) â€” SMS blast to all customers who
//      signed up on the "Coming Soon" waitlist for this city.
//      Sends one SMS per signup then marks them notified so
//      re-running is safe (idempotent).
//
// To enable Slack notifications:
//   CITY_ACTIVATION_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import logger from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import * as smsService from './sms.service.js';

const WEBHOOK_URL = process.env.CITY_ACTIVATION_WEBHOOK_URL;

/**
 * Notify internal channels that a city has been activated.
 * Fire-and-forget â€” errors are swallowed so they never block
 * the HTTP response that triggered the activation.
 *
 * @param {{ id: string, name: string, state: string, launch_date: string }} city
 */
export async function notifyCityActivation(city) {
  const payload = {
    text: `ðŸš€ *TezzNirmaan is now live in ${city.name}, ${city.state}!*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `ðŸ™ï¸ *City Activated:* ${city.name}, ${city.state}`,
            `ðŸ“… *Launch Date:* ${city.launch_date || new Date().toISOString().split('T')[0]}`,
            `ðŸ†” *City ID:* \`${city.id}\``,
          ].join('\n'),
        },
      },
    ],
  };

  logger.info(
    { cityId: city.id, cityName: city.name, webhookConfigured: !!WEBHOOK_URL },
    'city-notification: city activated'
  );

  if (!WEBHOOK_URL) {
    logger.warn('city-notification: CITY_ACTIVATION_WEBHOOK_URL not set â€” notification skipped');
    return;
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.warn(
        { status: res.status, cityId: city.id },
        'city-notification: webhook returned non-2xx status'
      );
    } else {
      logger.info({ cityId: city.id }, 'city-notification: webhook delivered');
    }
  } catch (err) {
    // Non-fatal â€” a webhook failure must never break city activation
    logger.error({ err, cityId: city.id }, 'city-notification: webhook request failed');
  }
}

/**
 * P5-6: SMS blast to every un-notified waitlist signup for a city.
 *
 * Design decisions:
 *   - Reads only WHERE notified = false (idempotent â€” safe to re-run)
 *   - Sends SMS one at a time (sequential) to avoid SMS provider
 *     rate-limit bursts. For >500 signups, consider batching in a
 *     background job instead.
 *   - Marks each row notified = true immediately after the SMS send
 *     so partial failures don't re-send to already-notified customers.
 *   - Never throws â€” errors are logged, activation is NOT blocked.
 *
 * Requires: migration 040_muzaffarpur_activation.sql (adds `notified` column)
 *
 * @param {string} cityId   â€” UUID of the newly activated city
 * @param {string} cityName â€” Human-readable name for the SMS body
 */
export async function notifyWaitlist(cityId, cityName) {
  logger.info({ cityId, cityName }, 'city-notification: starting waitlist SMS blast');

  // Fetch all un-notified signups for this city
  const { data: waitlist, error } = await supabaseAdmin
    .from('city_waitlist')
    .select('id, phone, name')
    .eq('city_id', cityId)
    .eq('notified', false)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ cityId, error: error.message }, 'city-notification: failed to fetch waitlist');
    return;
  }

  if (!waitlist || waitlist.length === 0) {
    logger.info({ cityId, cityName }, 'city-notification: no un-notified waitlist signups â€” nothing to send');
    return;
  }

  logger.info({ cityId, cityName, count: waitlist.length }, 'city-notification: sending launch SMS to waitlist');

  let sent = 0;
  let failed = 0;

  for (const person of waitlist) {
    const smsBody =
      `ðŸŽ‰ TezzNirmaan is now live in ${cityName}! ` +
      `Order hardware, paint, tiles & more â€” delivered in 60-90 minutes. ` +
      `Download: https://tezznirmaan.in`;

    try {
      await smsService.sendSMS(person.phone, smsBody);

      // Mark as notified immediately after successful send
      await supabaseAdmin
        .from('city_waitlist')
        .update({ notified: true })
        .eq('id', person.id);

      sent++;
    } catch (smsErr) {
      // Log and continue â€” don't let one bad phone number stop the rest
      logger.warn(
        { cityId, phone: person.phone.slice(0, 6) + '****', error: smsErr.message },
        'city-notification: SMS failed for one waitlist signup (skipping)'
      );
      failed++;
    }
  }

  logger.info(
    { cityId, cityName, total: waitlist.length, sent, failed },
    'city-notification: waitlist SMS blast complete'
  );
}

