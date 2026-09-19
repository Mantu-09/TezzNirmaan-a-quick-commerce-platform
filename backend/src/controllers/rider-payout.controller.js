// ────────────────────────────────────────────────────────────
// rider-payout.controller.js — P10-5
//
// Admin endpoints for managing rider payout requests.
// All routes: authenticate + requireRole('platform_admin')
// ────────────────────────────────────────────────────────────
import { supabaseAdmin }    from '../config/supabase.js';
import { AppError }         from '../utils/errors.js';
import { sendNotification } from '../services/notification.service.js';
import logger               from '../utils/logger.js';

// ── GET /admin/payouts/pending ────────────────────────────────
export async function listPendingPayouts(req, res, next) {
  try {
    const { status = 'all', page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Step 1: Fetch payout_requests + rider name/phone via riders → profiles
    // rider_fund_accounts has NO direct FK to payout_requests, so we fetch separately.
    let query = supabaseAdmin
      .from('payout_requests')
      .select(`
        id,
        rider_id,
        amount_paise,
        status,
        notes,
        created_at,
        updated_at,
        riders!payout_requests_rider_id_fkey (
          id,
          profile_id,
          profiles ( full_name, phone )
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    // Only filter by status values the DB CHECK constraint allows
    const VALID_STATUSES = ['pending', 'processing', 'paid', 'rejected'];
    if (status !== 'all' && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    const { data: requests, error, count } = await query;
    if (error) throw error;

    // Step 2: Batch-fetch rider_fund_accounts for all returned rider_ids
    const riderIds = [...new Set((requests || []).map(r => r.rider_id).filter(Boolean))];
    let fundAccountMap = {};
    if (riderIds.length > 0) {
      const { data: fundAccounts } = await supabaseAdmin
        .from('rider_fund_accounts')
        .select('rider_id, account_name, account_number_last4, ifsc_code, bank_name, razorpay_fund_account_id, is_verified')
        .in('rider_id', riderIds);
      (fundAccounts || []).forEach(fa => { fundAccountMap[fa.rider_id] = fa; });
    }

    // Step 3: Merge fund account into each request row
    const merged = (requests || []).map(r => ({
      ...r,
      rider_fund_accounts: fundAccountMap[r.rider_id] || null,
    }));

    // Compute totals for pending requests only
    const { data: pendingSum } = await supabaseAdmin
      .from('payout_requests')
      .select('amount_paise')
      .eq('status', 'pending');

    const totalPendingPaise = (pendingSum || []).reduce((s, r) => s + (r.amount_paise || 0), 0);
    const pendingCount      = (pendingSum || []).length;

    res.json({
      success: true,
      data: {
        requests:            merged,
        total_count:         count || 0,
        pending_count:       pendingCount,
        total_pending_paise: totalPendingPaise,
      },
    });
  } catch (err) {
    logger.error('GET /admin/payouts/pending error', { error: err.message });
    next(err);
  }
}

// ── GET /admin/payouts/balance ────────────────────────────────
export async function getRazorpayXBalance(req, res, next) {
  try {
    const keyId     = process.env.RAZORPAYX_KEY_ID;
    const keySecret = process.env.RAZORPAYX_KEY_SECRET;
    const accountNo = process.env.RAZORPAYX_ACCOUNT_NUMBER;

    if (!keyId || !keySecret || !accountNo) {
      return res.json({ success: true, data: { balance_paise: null, configured: false } });
    }

    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    const response = await fetch(
      `https://api.razorpay.com/v1/banking_accounts/${accountNo}`,
      { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
    );
    const rzpData = await response.json();

    if (!response.ok) {
      logger.warn('RazorpayX balance fetch failed', { status: response.status });
      return res.json({
        success: true,
        data: { balance_paise: null, configured: true, error: rzpData?.error?.description },
      });
    }

    res.json({
      success: true,
      data: { balance_paise: rzpData.balance, account_number: accountNo, configured: true },
    });
  } catch (err) {
    logger.error('GET /admin/payouts/balance error', { error: err.message });
    res.json({ success: true, data: { balance_paise: null, configured: false } });
  }
}

// ── POST /admin/payouts/:id/approve ──────────────────────────
export async function approvePayoutRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { processPayoutRequest } = await import('../services/razorpay-payout.service.js');
    const result = await processPayoutRequest(id);
    res.json({
      success: true,
      message: 'Payment initiated. Rider will receive funds within minutes.',
      data:    result,
    });
  } catch (err) {
    logger.error('POST /admin/payouts/:id/approve error', { error: err.message });
    next(err);
  }
}

// ── POST /admin/payouts/:id/reject ───────────────────────────
export async function rejectPayoutRequest(req, res, next) {
  try {
    const { id }     = req.params;
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const { data: pr, error: fetchErr } = await supabaseAdmin
      .from('payout_requests')
      .select('id, rider_id, amount_paise, status')
      .eq('id', id)
      .single();

    if (fetchErr || !pr) throw new AppError('Payout request not found', 404);
    if (pr.status === 'paid')     throw new AppError('Cannot reject a paid request', 409);
    if (pr.status === 'rejected') throw new AppError('Already rejected', 409);

    await supabaseAdmin
      .from('payout_requests')
      .update({ status: 'rejected', notes: reason.trim(), updated_at: new Date().toISOString() })
      .eq('id', id);

    const amountRupees = Math.round(pr.amount_paise / 100);
    try {
      await sendNotification(
        pr.rider_id,
        'payout_rejected',
        'Payout request rejected',
        `Your payout request for \u20b9${amountRupees} was rejected. Reason: ${reason.trim()}. Contact support if you have questions.`,
      );
    } catch (notifyErr) {
      logger.warn('Reject notification failed (non-fatal)', { error: notifyErr.message });
    }

    res.json({ success: true, message: 'Payout request rejected and rider notified.' });
  } catch (err) {
    logger.error('POST /admin/payouts/:id/reject error', { error: err.message });
    next(err);
  }
}
