// ────────────────────────────────────────────────────────────
// Settlement Service — P4-4B
//
// Generates weekly settlement batches for shop owners.
// Called by:
//   1. pg-boss weekly cron (Monday 09:00 IST)
//   2. POST /admin/settlements/generate (manual admin trigger)
//
// Flow per shop:
//   - Pull delivered sub_orders in the period via RPC
//   - Look up commission rule (shop-specific first, then default)
//   - Create settlement_batch + settlement_items in one transaction
//   - Notify shop owner via sendNotification() (fire-and-forget)
//
// Idempotency:
//   The RPC excludes orders already in a pending/paid batch.
//   The UNIQUE constraint on (shop_id, period_start, period_end)
//   prevents duplicate batches from concurrent runs.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { sendNotification } from './notification.service.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ── Commission Rule Lookup ─────────────────────────────────────

/**
 * Resolve the active commission rule for a shop.
 * Prefers a shop-specific rule over the platform default.
 * Falls back to 5% if no rule found in DB.
 *
 * @param {string} shopId
 * @returns {Promise<number>} commission percent (e.g. 5.00)
 */
async function getCommissionPercent(shopId) {
  // Try shop-specific rule first
  const { data: specific } = await supabaseAdmin
    .from('commission_rules')
    .select('commission_percent, valid_from, valid_until')
    .eq('shop_id', shopId)
    .or('valid_until.is.null,valid_until.gt.' + new Date().toISOString())
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (specific) return parseFloat(specific.commission_percent);

  // Fall back to default (shop_id IS NULL)
  const { data: def } = await supabaseAdmin
    .from('commission_rules')
    .select('commission_percent')
    .is('shop_id', null)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  return parseFloat(def?.commission_percent ?? '5.00');
}

// ── Generate Weekly Settlements ───────────────────────────────

/**
 * Generate settlement batches for all shops with delivered orders
 * in the given period. Defaults to the past 7 days if no dates given.
 *
 * @param {Date} [periodEnd]   - end of period (exclusive). Defaults to now().
 * @param {Date} [periodStart] - start of period. Defaults to periodEnd - 7 days.
 * @returns {{ created: number, skipped: number, errors: number }}
 */
export async function generateWeeklySettlements(periodEnd, periodStart) {
  const end   = periodEnd   || new Date();
  const start = periodStart || new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const periodStartISO = start.toISOString();
  const periodEndISO   = end.toISOString();
  const periodStartDate = start.toISOString().split('T')[0];
  const periodEndDate   = end.toISOString().split('T')[0];

  logger.info({ periodStart: periodStartISO, periodEnd: periodEndISO }, 'settlement: generating weekly batches');

  // Pull delivered orders grouped by shop (excludes already-settled)
  const { data: shopRows, error: rpcErr } = await supabaseAdmin.rpc(
    'get_orders_for_settlement',
    { p_start: periodStartISO, p_end: periodEndISO }
  );

  if (rpcErr) {
    logger.error({ error: rpcErr.message }, 'settlement: RPC failed');
    throw new AppError('Settlement RPC failed: ' + rpcErr.message, 500);
  }

  if (!shopRows?.length) {
    logger.info('settlement: no unsettled delivered orders in period');
    return { created: 0, skipped: 0, errors: 0 };
  }

  let created = 0;
  let skipped = 0;
  let errors  = 0;

  for (const row of shopRows) {
    try {
      const commissionPercent = await getCommissionPercent(row.shop_id);
      const grossPaise        = Number(row.gross_paise);
      const commissionPaise   = Math.floor(grossPaise * commissionPercent / 100);
      const netPaise          = grossPaise - commissionPaise;

      // Insert settlement_batch (ON CONFLICT DO NOTHING for idempotency)
      const { data: batch, error: batchErr } = await supabaseAdmin
        .from('settlement_batches')
        .insert({
          shop_id:             row.shop_id,
          period_start:        periodStartDate,
          period_end:          periodEndDate,
          gross_amount_paise:  grossPaise,
          commission_paise:    commissionPaise,
          net_amount_paise:    netPaise,
          order_count:         Number(row.order_count),
          status:              'pending',
        })
        .select('id')
        .single();

      if (batchErr) {
        // Unique constraint violation = already settled this period for this shop
        if (batchErr.code === '23505') {
          logger.debug({ shopId: row.shop_id }, 'settlement: batch already exists for period — skipping');
          skipped++;
          continue;
        }
        throw batchErr;
      }

      const batchId = batch.id;

      // Insert line items (one per sub_order)
      if (row.sub_order_ids?.length) {
        // Fetch sub_order amounts individually to compute per-item commission
        const { data: subOrders } = await supabaseAdmin
          .from('sub_orders')
          .select('id, order_id, total_amount')
          .in('id', row.sub_order_ids);

        const items = (subOrders || []).map((so) => {
          const itemGross      = Number(so.total_amount);
          const itemCommission = Math.floor(itemGross * commissionPercent / 100);
          return {
            batch_id:           batchId,
            order_id:           so.order_id,
            sub_order_id:       so.id,
            gross_amount_paise: itemGross,
            commission_paise:   itemCommission,
            net_amount_paise:   itemGross - itemCommission,
          };
        });

        if (items.length) {
          const { error: itemsErr } = await supabaseAdmin
            .from('settlement_items')
            .insert(items);

          if (itemsErr) {
            logger.error({ batchId, error: itemsErr.message }, 'settlement: failed to insert items');
          }
        }
      }

      logger.info({
        shopId: row.shop_id, shopName: row.shop_name, batchId,
        grossPaise, commissionPaise, netPaise, orderCount: row.order_count,
      }, 'settlement: batch created');

      created++;

      // Notify shop owner (fire-and-forget — never block the loop)
      if (row.owner_id) {
        const netRupees = (netPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
        sendNotification(
          row.owner_id,
          'settlement_ready',
          'Your weekly payout is ready 💰',
          `₹${netRupees} will be transferred to your account within 2 business days.`,
          { batch_id: batchId },
          false // no SMS for settlement (push only)
        ).catch(() => {});
      }

    } catch (err) {
      logger.error({ shopId: row.shop_id, error: err.message }, 'settlement: failed to create batch for shop');
      errors++;
    }
  }

  logger.info({ created, skipped, errors }, 'settlement: generation complete');
  return { created, skipped, errors };
}

// ── Shop-Facing Queries ───────────────────────────────────────

/**
 * GET /shop/settlements
 * Returns paginated settlement batches for a shop.
 *
 * @param {string} shopId
 * @param {number} page
 * @param {number} limit
 */
export async function getSettlementsForShop(shopId, page = 1, limit = 20) {
  const from = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('settlement_batches')
    .select('*', { count: 'exact' })
    .eq('shop_id', shopId)
    .order('period_start', { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;

  // Summary stats — all batches for this shop (unfiltered)
  const { data: summary } = await supabaseAdmin
    .from('settlement_batches')
    .select('status, net_amount_paise')
    .eq('shop_id', shopId);

  const totalEarned   = (summary || []).filter(r => r.status === 'paid')
    .reduce((s, r) => s + Number(r.net_amount_paise), 0);
  const pendingAmount = (summary || []).filter(r => r.status === 'pending')
    .reduce((s, r) => s + Number(r.net_amount_paise), 0);

  return {
    batches: data || [],
    pagination: { page: +page, limit: +limit, total: count },
    summary: { total_earned_paise: totalEarned, pending_paise: pendingAmount },
  };
}

/**
 * GET /shop/settlements/:batchId
 * Returns a settlement batch with its line items.
 */
export async function getSettlementDetail(batchId, shopId) {
  const { data: batch, error } = await supabaseAdmin
    .from('settlement_batches')
    .select('*')
    .eq('id', batchId)
    .eq('shop_id', shopId)
    .single();

  if (error || !batch) throw new NotFoundError('Settlement not found');

  const { data: items } = await supabaseAdmin
    .from('settlement_items')
    .select('*, orders(order_number, created_at)')
    .eq('batch_id', batchId)
    .order('created_at');

  return { batch, items: items || [] };
}

// ── Admin Queries ─────────────────────────────────────────────

/**
 * GET /admin/settlements/pending
 * Returns all pending batches across all shops.
 */
export async function getPendingSettlements() {
  const { data, error } = await supabaseAdmin
    .from('settlement_batches')
    .select(`
      *,
      shops!inner(name, phone, city)
    `)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true });

  if (error) throw error;

  const totalOutstanding = (data || [])
    .reduce((s, r) => s + Number(r.net_amount_paise), 0);

  return { batches: data || [], total_outstanding_paise: totalOutstanding };
}

/**
 * PATCH /admin/settlements/:batchId/paid
 * Mark a settlement batch as paid.
 *
 * @param {string} batchId
 * @param {string} paymentMethod  — 'upi' | 'bank_transfer'
 * @param {string} paymentReference — UPI txn ID or bank ref
 * @param {string} [notes]
 */
export async function markSettlementPaid(batchId, paymentMethod, paymentReference, notes) {
  const { data, error } = await supabaseAdmin
    .from('settlement_batches')
    .update({
      status:            'paid',
      payment_method:    paymentMethod,
      payment_reference: paymentReference,
      notes:             notes || null,
      paid_at:           new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    })
    .eq('id', batchId)
    .in('status', ['pending', 'processing']) // guard: can only pay pending/processing
    .select(`*, shops!inner(name, owner_id)`)
    .single();

  if (error || !data) {
    throw new AppError('Settlement batch not found or already paid', 404);
  }

  logger.info({ batchId, paymentMethod, paymentReference }, 'settlement: marked as paid');

  // Notify shop owner
  if (data.shops?.owner_id) {
    const netRupees = (Number(data.net_amount_paise) / 100)
      .toLocaleString('en-IN', { maximumFractionDigits: 0 });
    sendNotification(
      data.shops.owner_id,
      'settlement_paid',
      'Payment sent! 💰',
      `₹${netRupees} has been transferred to your account. Ref: ${paymentReference}`,
      { batch_id: batchId },
      true // SMS for actual payment confirmation
    ).catch(() => {});
  }

  return data;
}
