// ────────────────────────────────────────────────────────────
// Referral Service — P4-2A
//
// Manages the full referral lifecycle:
//   1. getOrCreateReferralCode()   — idempotent, called on GET /customer/referral
//   2. applyReferralCode()         — called at OTP verify for new users
//   3. processReferralReward()     — called via job queue on first order completion
//   4. getReferralStats()          — full stats + events list for Referral Screen
//
// Reward amounts (configurable here, not in DB — change once to affect all future):
//   REFERRED_BONUS_PAISE = 10000  (₹100 — credited immediately on signup)
//   REFERRER_REWARD_PAISE =  5000  (₹50  — credited when referred places first order)
//
// Code format: "TN-" + 6 chars from an unambiguous alphabet (no 0/O, 1/I).
// Collision probability at 1,000 codes: ~0.003% (safe up to ~100k users).
// ────────────────────────────────────────────────────────────
import { supabaseAdmin }        from '../config/supabase.js';
import * as walletService       from './wallet.service.js';
import * as notificationService from './notification.service.js';
import { AppError }             from '../utils/errors.js';
import logger                   from '../utils/logger.js';

// ── Constants ─────────────────────────────────────────────────
const CODE_ALPHABET        = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const CODE_PREFIX          = 'TN-';
const CODE_LENGTH          = 6;
const MAX_CODE_ATTEMPTS    = 10;

export const REFERRED_BONUS_PAISE  = 10_000;  // ₹100 — new user signup bonus
export const REFERRER_REWARD_PAISE  = 5_000;  // ₹50  — referrer first-order reward
export const REFERRED_BONUS_EXPIRY_DAYS = 30; // bonus expires if not used within 30 days

// ── Code generation helpers ───────────────────────────────────

function _generateCode() {
  return CODE_PREFIX + Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join('');
}

async function _codeExists(code) {
  const { data } = await supabaseAdmin
    .from('referral_codes')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  return !!data;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Get or create the referral code for a user.
 * Idempotent — safe to call multiple times.
 *
 * @param {string} userId  auth.users UUID
 * @returns {object}  referral_codes row
 */
export async function getOrCreateReferralCode(userId) {
  // Return existing code if already created
  const { data: existing } = await supabaseAdmin
    .from('referral_codes')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return existing;

  // Generate a unique code (collision loop, terminates in 1 attempt 99.9% of the time)
  let code;
  let attempts = 0;
  do {
    code = _generateCode();
    attempts++;
    if (attempts > MAX_CODE_ATTEMPTS) {
      throw new AppError('Could not generate unique referral code — retry', 500);
    }
  } while (await _codeExists(code));

  const { data, error } = await supabaseAdmin
    .from('referral_codes')
    .insert({ user_id: userId, code })
    .select()
    .single();

  if (error) throw error;

  logger.info('referral: code created', { userId, code });
  return data;
}

/**
 * Apply a referral code when a new user signs up.
 * Call from auth.controller verifyOtp — NEVER block signup on failure.
 *
 * @param {string} newUserId  The newly created user's UUID
 * @param {string} code       The referral code they entered (case-insensitive)
 */
export async function applyReferralCode(newUserId, code) {
  const normalised = code.trim().toUpperCase();

  // 1. Resolve the referral code
  const { data: referralCode, error: codeErr } = await supabaseAdmin
    .from('referral_codes')
    .select('id, user_id, code')
    .eq('code', normalised)
    .maybeSingle();

  if (codeErr) throw codeErr;
  if (!referralCode) throw new AppError(`Referral code "${normalised}" not found`, 404);
  if (referralCode.user_id === newUserId) {
    throw new AppError('You cannot use your own referral code', 422);
  }

  // 2. Ensure this new user hasn't already been referred by someone
  const { data: alreadyReferred } = await supabaseAdmin
    .from('referral_events')
    .select('id')
    .eq('referred_id', newUserId)
    .maybeSingle();

  if (alreadyReferred) throw new AppError('Referral already applied to this account', 422);

  // 3. Create the pending referral event
  const { error: insertErr } = await supabaseAdmin
    .from('referral_events')
    .insert({
      referrer_id:           referralCode.user_id,
      referred_id:           newUserId,
      referral_code_id:      referralCode.id,
      referrer_reward_paise: REFERRER_REWARD_PAISE,
      referred_reward_paise: REFERRED_BONUS_PAISE,
      status:                'pending',
    });

  if (insertErr) throw insertErr;

  // 4. Credit the new user ₹100 immediately (expires in 30 days → urgency to order)
  const expiresAt = new Date(Date.now() + REFERRED_BONUS_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    .toISOString();

  try {
    await walletService.creditWallet(
      newUserId,
      REFERRED_BONUS_PAISE,
      'credit_referral',
      `Welcome bonus — referral code ${normalised}`,
      null,      // no order reference at signup
      expiresAt,
    );
  } catch (walletErr) {
    // Log but don't throw — referral event is already recorded.
    // A background admin job can retry failed credits.
    logger.error('referral: failed to credit welcome bonus', {
      newUserId, code: normalised, error: walletErr.message,
    });
  }

  logger.info('referral: code applied', {
    newUserId,
    referrerId: referralCode.user_id,
    code: normalised,
  });

  return { success: true, bonus_credited_paise: REFERRED_BONUS_PAISE };
}

/**
 * Process the referral reward when a referred user places their FIRST order.
 * Called via job queue — must be idempotent.
 *
 * @param {string} userId   The user who just placed an order
 * @param {string} orderId  The order that triggered the check
 */
export async function processReferralReward(userId, orderId) {
  // Find the pending referral event for this user
  const { data: event } = await supabaseAdmin
    .from('referral_events')
    .select('*')
    .eq('referred_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (!event) return; // not a referred user, or already rewarded — no-op

  // ── Check this is actually their FIRST completed/confirmed order ──
  // Count all orders EXCLUDING the current one with status not cancelled
  const { count: priorOrders } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', userId)
    .neq('id', orderId)
    .not('status', 'in', '("cancelled","payment_failed")');

  if ((priorOrders ?? 0) > 0) {
    // Not their first order — don't reward
    return;
  }

  // ── Mark rewarded (idempotent via status check above) ────────
  const { error: updateErr } = await supabaseAdmin
    .from('referral_events')
    .update({
      status:           'rewarded',
      trigger_order_id: orderId,
      rewarded_at:      new Date().toISOString(),
    })
    .eq('id', event.id)
    .eq('status', 'pending');  // extra guard against race conditions

  if (updateErr) {
    logger.error('referral: failed to mark event rewarded', { eventId: event.id, error: updateErr.message });
    throw updateErr;
  }

  // ── Credit referrer ₹50 ──────────────────────────────────────
  try {
    await walletService.creditWallet(
      event.referrer_id,
      REFERRER_REWARD_PAISE,
      'credit_referral',
      'Referral reward — your friend placed their first TezzNirmaan order!',
      orderId,
    );
  } catch (walletErr) {
    logger.error('referral: failed to credit referrer wallet', {
      referrerId: event.referrer_id, error: walletErr.message,
    });
    throw walletErr; // re-throw so job queue retries
  }

  // ── Update referral_codes stats ──────────────────────────────
  await supabaseAdmin.rpc('increment_referral_stats', {
    p_referrer_id:        event.referrer_id,
    p_earned_paise_delta: REFERRER_REWARD_PAISE,
  });

  // ── Notify referrer ──────────────────────────────────────────
  try {
    await notificationService.sendNotification(
      event.referrer_id,
      'referral_rewarded',
      'Referral reward! 🎉',
      `₹${REFERRER_REWARD_PAISE / 100} added to your wallet — your friend just placed their first TezzNirmaan order!`,
      { orderId }
    );
  } catch (notifErr) {
    logger.warn('referral: notification failed (non-fatal)', { error: notifErr.message });
  }

  logger.info('referral: reward processed', {
    eventId:    event.id,
    referrerId: event.referrer_id,
    referredId: userId,
    orderId,
    paise:      REFERRER_REWARD_PAISE,
  });
}

/**
 * Full referral stats for the Referral Screen.
 * Returns the user's code + list of their referral events.
 *
 * @param {string} userId
 */
export async function getReferralStats(userId) {
  // Get or create the referral code (lazy creation)
  const codeRow = await getOrCreateReferralCode(userId);

  // Fetch referral events as referrer
  const { data: events } = await supabaseAdmin
    .from('referral_events')
    .select('id, status, created_at, rewarded_at, referrer_reward_paise, referred_reward_paise')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const eventList = events || [];

  return {
    code:                 codeRow.code,
    share_url:            `https://tezznirmaan.in/?ref=${codeRow.code}`,
    times_used:           codeRow.times_used,
    total_earned_paise:   codeRow.total_earned_paise,
    total_earned_inr:     codeRow.total_earned_paise / 100,
    pending_count:        eventList.filter(e => e.status === 'pending').length,
    rewarded_count:       eventList.filter(e => e.status === 'rewarded').length,
    events:               eventList.map(e => ({
      id:            e.id,
      status:        e.status,                // 'pending' | 'rewarded'
      created_at:    e.created_at,
      rewarded_at:   e.rewarded_at,
      earned_paise:  e.status === 'rewarded' ? e.referrer_reward_paise : 0,
    })),
  };
}
