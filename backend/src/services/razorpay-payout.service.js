// ────────────────────────────────────────────────────────────
// razorpay-payout.service.js — P10-4
//
// RazorpayX Payouts API — automated rider earnings transfer.
//
// RazorpayX is SEPARATE from the payment gateway:
//   - Different API keys (RAZORPAYX_KEY_ID / RAZORPAYX_KEY_SECRET)
//   - Different account (RazorpayX virtual account)
//   - Different base URL: https://api.razorpay.com/v1/ (same host,
//     different credentials and resources)
//
// Flow:
//   1. createContact(rider)        — registers rider in RazorpayX
//   2. createFundAccount(...)      — links their bank account
//   3. Both saved to rider_fund_accounts table
//   4. initiatePayout(...)         — triggers actual bank transfer
//      Generates deterministic idempotency key (MANDATORY March 2025)
//      Records in rider_payouts table
//   5. handlePayoutWebhook(...)    — processes status updates
//
// Idempotency: sha256("payout-{requestId}-{riderId}").slice(0,40)
//   Same payout request always produces same key → retry-safe
//
// Error philosophy:
//   Service functions throw on real failures (caller catches).
//   Webhook handler is fail-silent for notification sub-steps
//   (payout status update is the critical part; notification failure
//   must never roll back the DB update).
// ────────────────────────────────────────────────────────────
import crypto            from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError }      from '../utils/errors.js';
import { sendNotification } from './notification.service.js';
import { sendSMS as sendSms }  from './sms.service.js';
import logger            from '../utils/logger.js';

// ── RazorpayX credentials ────────────────────────────────────
// These are DIFFERENT from RAZORPAY_KEY_ID used by the payment gateway.
// RazorpayX requires a separate account activated for payouts.
const RAZORPAYX_KEY_ID        = process.env.RAZORPAYX_KEY_ID;
const RAZORPAYX_KEY_SECRET    = process.env.RAZORPAYX_KEY_SECRET;
const RAZORPAYX_ACCOUNT_NUMBER = process.env.RAZORPAYX_ACCOUNT_NUMBER;
const RAZORPAYX_WEBHOOK_SECRET = process.env.RAZORPAYX_WEBHOOK_SECRET;

function getAuthHeader() {
  if (!RAZORPAYX_KEY_ID || !RAZORPAYX_KEY_SECRET) {
    throw new AppError('RazorpayX credentials not configured', 500);
  }
  const encoded = Buffer.from(`${RAZORPAYX_KEY_ID}:${RAZORPAYX_KEY_SECRET}`).toString('base64');
  return `Basic ${encoded}`;
}

function razorpayxHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Authorization': getAuthHeader(),
    ...extra,
  };
}

// ── Step 1: Create RazorpayX contact ─────────────────────────
/**
 * Register a rider as a RazorpayX contact (required before fund account).
 * @param {{ id: string, name: string, phone: string }} rider
 * @returns {string} razorpay_contact_id (cont_xxx)
 */
export async function createContact(rider) {
  logger.info('[razorpay-payout] Creating contact', { riderId: rider.id });

  const response = await fetch('https://api.razorpay.com/v1/contacts', {
    method:  'POST',
    headers: razorpayxHeaders(),
    body:    JSON.stringify({
      name:         rider.name || rider.phone,
      contact:      rider.phone,
      type:         'employee',
      reference_id: rider.id,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new AppError(
      `RazorpayX contact creation failed: ${data.error?.description || 'Unknown error'}`,
      502
    );
  }

  logger.info('[razorpay-payout] Contact created', { contactId: data.id, riderId: rider.id });
  return data.id; // cont_xxx
}

// ── Step 2: Create fund account (bank account) ────────────────
/**
 * Register a bank account under a RazorpayX contact.
 * @param {string} contactId  — cont_xxx from createContact()
 * @param {{ account_name, ifsc_code, account_number }} bankDetails
 * @returns {string} razorpay_fund_account_id (fa_xxx)
 */
export async function createFundAccount(contactId, bankDetails) {
  logger.info('[razorpay-payout] Creating fund account', { contactId });

  const response = await fetch('https://api.razorpay.com/v1/fund_accounts', {
    method:  'POST',
    headers: razorpayxHeaders(),
    body:    JSON.stringify({
      contact_id:   contactId,
      account_type: 'bank_account',
      bank_account: {
        name:           bankDetails.account_name,
        ifsc:           bankDetails.ifsc_code,
        account_number: bankDetails.account_number, // Full number for RazorpayX API only
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new AppError(
      `RazorpayX fund account creation failed: ${data.error?.description || 'Unknown error'}`,
      502
    );
  }

  logger.info('[razorpay-payout] Fund account created', { fundAccountId: data.id });
  return data.id; // fa_xxx
}

// ── Step 3: Initiate payout ───────────────────────────────────
/**
 * Initiate a bank transfer to a rider.
 *
 * CRITICAL: X-Payout-Idempotency header is mandatory from March 2025.
 * We generate it deterministically so retries of the same payout request
 * never create duplicate payments.
 *
 * @param {string} payoutRequestId  — UUID of the payout_request row
 * @param {string} riderId          — rider's profile id (= auth.uid())
 * @param {number} amountPaise      — amount in paise (e.g. 50000 = ₹500)
 * @param {string} fundAccountId    — fa_xxx from rider_fund_accounts
 * @returns {object} rider_payout DB row
 */
export async function initiatePayout(payoutRequestId, riderId, amountPaise, fundAccountId) {
  if (!RAZORPAYX_ACCOUNT_NUMBER) {
    throw new AppError('RAZORPAYX_ACCOUNT_NUMBER not configured', 500);
  }

  // Deterministic idempotency key — same for every retry of the same request
  // sha256 → 64 hex chars → take first 40 (RazorpayX limit is 50 chars)
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`payout-${payoutRequestId}-${riderId}`)
    .digest('hex')
    .substring(0, 40);

  logger.info('[razorpay-payout] Initiating payout', {
    payoutRequestId, riderId, amountPaise, idempotencyKey,
  });

  // Idempotency check — if already processed/processing, return existing record
  const { data: existing } = await supabaseAdmin
    .from('rider_payouts')
    .select('id, status, razorpay_payout_id, amount_paise')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing && existing.status !== 'failed') {
    logger.info('[razorpay-payout] Payout already exists, returning existing', {
      id: existing.id, status: existing.status,
    });
    return existing;
  }

  // Call RazorpayX Payouts API
  // X-Payout-Idempotency is MANDATORY from March 15, 2025
  const response = await fetch('https://api.razorpay.com/v1/payouts', {
    method:  'POST',
    headers: razorpayxHeaders({
      'X-Payout-Idempotency': idempotencyKey, // ← MANDATORY
    }),
    body: JSON.stringify({
      account_number:      RAZORPAYX_ACCOUNT_NUMBER,
      fund_account_id:     fundAccountId,
      amount:              amountPaise,
      currency:            'INR',
      // IMPS for amounts ≤ ₹2L (200000 paise); use NEFT/RTGS for larger
      mode:                amountPaise <= 20000000 ? 'IMPS' : 'NEFT',
      purpose:             'payout',
      queue_if_low_balance: true, // Never fail on low balance — queue instead
      reference_id:        payoutRequestId,
      narration:           'TezzNirmaan rider earnings',
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    // Record the failure in DB before throwing
    if (existing) {
      await supabaseAdmin
        .from('rider_payouts')
        .update({ status: 'failed', failure_reason: data.error?.description })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin.from('rider_payouts').insert({
        payout_request_id:        payoutRequestId,
        rider_id:                 riderId,
        razorpay_fund_account_id: fundAccountId,
        amount_paise:             amountPaise,
        idempotency_key:          idempotencyKey,
        status:                   'failed',
        failure_reason:           data.error?.description || 'RazorpayX API error',
      });
    }
    throw new AppError(
      `RazorpayX payout failed: ${data.error?.description || 'Unknown error'}`,
      502
    );
  }

  // Upsert payout record (handles both new and retry-of-failed)
  const { data: payoutRow, error: dbErr } = await supabaseAdmin
    .from('rider_payouts')
    .upsert({
      payout_request_id:        payoutRequestId,
      rider_id:                 riderId,
      razorpay_payout_id:       data.id,
      razorpay_fund_account_id: fundAccountId,
      amount_paise:             amountPaise,
      idempotency_key:          idempotencyKey,
      status:                   data.status, // 'queued' or 'processing'
      initiated_at:             new Date().toISOString(),
    }, { onConflict: 'idempotency_key' })
    .select()
    .single();

  if (dbErr) {
    // Payout was initiated with RazorpayX but DB write failed
    // Log critically — manual reconciliation may be needed
    logger.error('[razorpay-payout] CRITICAL: Payout initiated but DB record failed', {
      razorpayPayoutId: data.id, payoutRequestId, error: dbErr.message,
    });
  }

  logger.info('[razorpay-payout] Payout initiated', {
    razorpayPayoutId: data.id, status: data.status, amountPaise,
  });

  return payoutRow || { razorpay_payout_id: data.id, status: data.status };
}

// ── Step 4: Register rider bank account ──────────────────────
/**
 * Full flow: create RazorpayX contact + fund account + save to DB.
 * Called by POST /rider/bank-account controller.
 *
 * @param {string} riderId  — profile id (= auth.uid())
 * @param {object} rider    — { name, phone }
 * @param {object} bankDetails — { account_name, account_number, ifsc_code, bank_name }
 * @returns {object} rider_fund_accounts DB row
 */
export async function registerBankAccount(riderId, rider, bankDetails) {
  // Check if already registered
  const { data: existing } = await supabaseAdmin
    .from('rider_fund_accounts')
    .select('id, razorpay_fund_account_id, is_verified')
    .eq('rider_id', riderId)
    .maybeSingle();

  if (existing?.razorpay_fund_account_id) {
    throw new AppError(
      'Bank account already registered. Contact support to update it.',
      409
    );
  }

  // Create RazorpayX contact
  const contactId = await createContact({ id: riderId, ...rider });

  // Create fund account under the contact
  const fundAccountId = await createFundAccount(contactId, bankDetails);

  // Store in DB — never store full account number
  const last4 = String(bankDetails.account_number).slice(-4);
  const { data: row, error } = await supabaseAdmin
    .from('rider_fund_accounts')
    .upsert({
      rider_id:                 riderId,
      razorpay_contact_id:      contactId,
      razorpay_fund_account_id: fundAccountId,
      account_name:             bankDetails.account_name,
      account_number_last4:     last4,
      ifsc_code:                bankDetails.ifsc_code,
      bank_name:                bankDetails.bank_name || null,
      is_verified:              false, // Marked true after first successful payout
      updated_at:               new Date().toISOString(),
    }, { onConflict: 'rider_id' })
    .select()
    .single();

  if (error) throw new AppError(`Failed to save bank account: ${error.message}`, 500);

  logger.info('[razorpay-payout] Bank account registered', { riderId, fundAccountId });
  return row;
}

// ── Webhook: handle RazorpayX payout status updates ──────────
/**
 * Process RazorpayX webhook events.
 * Called by POST /payments/razorpayx/webhook (no JWT auth — verified by signature).
 *
 * @param {object} payload    — parsed JSON body from RazorpayX
 * @param {string} signature  — X-Razorpay-Signature header value
 */
export async function handlePayoutWebhook(payload, signature, rawBody) {
  // ── Signature verification ────────────────────────
  if (!RAZORPAYX_WEBHOOK_SECRET) {
    throw new AppError('RAZORPAYX_WEBHOOK_SECRET not configured', 500);
  }

  // CRITICAL: HMAC must be computed on the ORIGINAL raw bytes, not on
  // JSON.stringify(parsedObject). Re-serialisation changes key order/whitespace
  // and will always produce a signature mismatch on valid payloads.
  const signingBody = rawBody ?? JSON.stringify(payload); // rawBody preferred

  const expectedSig = crypto
    .createHmac('sha256', RAZORPAYX_WEBHOOK_SECRET)
    .update(signingBody)
    .digest('hex');

  if (signature !== expectedSig) {
    throw new AppError('Invalid RazorpayX webhook signature', 401);
  }

  const event  = payload.event;
  const payout = payload.payload?.payout?.entity;

  if (!payout) {
    logger.warn('[razorpay-payout] Webhook received with no payout entity', { event });
    return;
  }

  logger.info('[razorpay-payout] Webhook received', { event, payoutId: payout.id });

  switch (event) {
    case 'payout.processed': {
      // ── Mark payout as processed ──────────────────────────
      await supabaseAdmin
        .from('rider_payouts')
        .update({
          status:       'processed',
          utr:          payout.utr,
          processed_at: new Date().toISOString(),
        })
        .eq('razorpay_payout_id', payout.id);

      // ── Fetch payout record for downstream updates ────────
      const { data: payoutRecord } = await supabaseAdmin
        .from('rider_payouts')
        .select('payout_request_id, rider_id, amount_paise')
        .eq('razorpay_payout_id', payout.id)
        .maybeSingle();

      if (!payoutRecord) {
        logger.warn('[razorpay-payout] payout.processed: no DB record for', { payoutId: payout.id });
        break;
      }

      // ── Mark payout_request as paid ───────────────────────
      await supabaseAdmin
        .from('payout_requests')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', payoutRecord.payout_request_id);

      // ── Mark pending rider_earnings as paid ───────────────
      await supabaseAdmin
        .from('rider_earnings')
        .update({ payment_status: 'paid' })
        .eq('rider_id', payoutRecord.rider_id)
        .eq('payment_status', 'pending');

      // ── Mark bank account as verified (first payout success) ─
      await supabaseAdmin
        .from('rider_fund_accounts')
        .update({ is_verified: true })
        .eq('rider_id', payoutRecord.rider_id)
        .eq('is_verified', false);

      // ── Notify rider (fail-silent) ────────────────────────
      const amountRupees = Math.round(payoutRecord.amount_paise / 100);
      try {
        await sendNotification(
          payoutRecord.rider_id,
          'payout_processed',
          'Payment sent! 💰',
          `₹${amountRupees} transferred to your bank account. UTR: ${payout.utr}`,
          { utr: payout.utr, amount_paise: payoutRecord.amount_paise },
        );
      } catch (notifyErr) {
        logger.warn('[razorpay-payout] Notification failed (non-fatal)', {
          error: notifyErr.message,
        });
      }

      logger.info('[razorpay-payout] Payout processed', {
        payoutId:   payout.id,
        utr:        payout.utr,
        amountPaise: payoutRecord.amount_paise,
      });
      break;
    }

    case 'payout.queued': {
      await supabaseAdmin
        .from('rider_payouts')
        .update({ status: 'queued' })
        .eq('razorpay_payout_id', payout.id);
      break;
    }

    case 'payout.processing': {
      await supabaseAdmin
        .from('rider_payouts')
        .update({ status: 'processing' })
        .eq('razorpay_payout_id', payout.id);
      break;
    }

    case 'payout.failed': {
      await supabaseAdmin
        .from('rider_payouts')
        .update({
          status:         'failed',
          failure_reason: payout.error?.description || 'Unknown failure',
        })
        .eq('razorpay_payout_id', payout.id);

      // ── Alert founder via SMS ─────────────────────────────
      const amountRupees = Math.round((payout.amount || 0) / 100);
      const founderPhone = process.env.FOUNDER_PHONE;
      if (founderPhone) {
        sendSms(
          founderPhone,
          `\u26a0\ufe0f TezzNirmaan: Rider payout FAILED \u20b9${amountRupees}. Reason: ${payout.error?.description}. Check /admin/riders.`
        ).catch(() => {}); // fail-silent
      }

      logger.error('[razorpay-payout] Payout failed', {
        payoutId:  payout.id,
        reason:    payout.error?.description,
        amountPaise: payout.amount,
      });
      break;
    }

    case 'payout.reversed': {
      await supabaseAdmin
        .from('rider_payouts')
        .update({ status: 'reversed' })
        .eq('razorpay_payout_id', payout.id);

      logger.warn('[razorpay-payout] Payout reversed', { payoutId: payout.id });
      break;
    }

    default:
      logger.info('[razorpay-payout] Unhandled webhook event', { event });
  }
}

// ── Admin helpers ─────────────────────────────────────────────

/**
 * Process an approved payout_request — initiates the RazorpayX transfer.
 * Called by admin when approving a payout request.
 *
 * @param {string} payoutRequestId
 * @returns {object} payout result
 */
export async function processPayoutRequest(payoutRequestId) {
  // P11-0 Fix 5: Atomic check+update — race-safe.
  // Two admins clicking Approve simultaneously both pass a two-step check.
  // .eq('status', 'pending') on the UPDATE means only one writer wins.
  const { data: locked, error: lockErr } = await supabaseAdmin
    .from('payout_requests')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', payoutRequestId)
    .eq('status', 'pending')   // Only updates if still pending — race-safe
    .select('id, rider_id, amount_paise')
    .single();

  if (lockErr || !locked) {
    // Either not found, or already processing/paid/rejected — both are 409
    throw new AppError('Payout already processing or completed', 409);
  }

  // Fetch rider fund account
  const { data: fundAccount, error: faErr } = await supabaseAdmin
    .from('rider_fund_accounts')
    .select('razorpay_fund_account_id, account_name, bank_name')
    .eq('rider_id', locked.rider_id)
    .maybeSingle();

  if (faErr || !fundAccount?.razorpay_fund_account_id) {
    // Roll back status if fund account missing — don't leave stuck in 'processing'
    await supabaseAdmin
      .from('payout_requests')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', payoutRequestId);
    throw new AppError(
      'Rider has no registered bank account. Ask them to set up bank account first.',
      422
    );
  }

  // Initiate RazorpayX payout — use locked.rider_id and locked.amount_paise
  // (guaranteed correct — not re-fetched after lock)
  const result = await initiatePayout(
    locked.id,
    locked.rider_id,
    locked.amount_paise,
    fundAccount.razorpay_fund_account_id
  );

  return result;
}
