// ────────────────────────────────────────────────────────────
// Referral Controller — P4-2A
//
// GET  /customer/referral  → code, share_url, stats, events list
// ────────────────────────────────────────────────────────────
import * as referralService from '../services/referral.service.js';

/**
 * GET /customer/referral
 * Returns the authenticated customer's referral code and stats.
 * Creates the code lazily on first call.
 */
export async function getReferralStats(req, res, next) {
  try {
    const stats = await referralService.getReferralStats(req.user.id);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}
