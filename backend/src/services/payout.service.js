// ────────────────────────────────────────────────────────────
// Payout Service — Razorpay Route (P8-2)
//
// NOTE: This is named payout.service.js (not route.service.js)
// because route.service.js already exists and handles rider
// delivery route optimization (Google Maps). Naming collision
// avoided intentionally.
//
// What this does:
//   1. createLinkedAccount(shopId)
//        Called once per shop via POST /admin/shops/:shopId/route/setup
//        Creates a Razorpay Route linked account and saves the ID.
//
//   2. transferToShop(orderId, razorpayPaymentId)
//        Called by the pg-boss 'route-transfer' worker after
//        payment.captured webhook fires.
//        Reads the commission rule, calls razorpay.payments.transfer(),
//        records the transfer in route_transfers.
//        Falls back gracefully if the shop is not yet on Route.
//
//   3. handleTransferProcessed(payload) / handleTransferFailed(payload)
//        Called by payment.controller.js when Razorpay sends
//        transfer.processed / transfer.failed webhook events.
//
//   4. getRouteTransfers(filters) — admin list endpoint
//   5. getShopRouteTransfers(shopId) — shop-facing history
//   6. reverseTransfer(transferId) — admin reversal
//   7. getRouteSummary() — admin dashboard widget
//
// Commission resolution:
//   Uses the same getCommissionPercent() logic as settlement.service.js
//   (shop-specific rule → platform default → 5% hardcoded fallback).
//
// Graceful degradation:
//   If a shop has no linked Razorpay account, transferToShop()
//   returns { method: 'manual' } and the existing weekly settlement
//   flow handles that shop. No errors thrown — mixed operation is
//   supported so shops can be migrated to Route one at a time.
// ────────────────────────────────────────────────────────────
import { razorpay }        from '../config/razorpay.js';
import { supabaseAdmin }   from '../config/supabase.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { send as sendSms } from './sms.service.js';
import logger              from '../utils/logger.js';

// ── Commission lookup (mirrors settlement.service.js) ─────────

/**
 * Resolve commission % for a shop.
 * Priority: shop-specific rule → platform default → 5% hardcoded.
 */
async function getCommissionPercent(shopId) {
  const now = new Date().toISOString();

  const { data: specific } = await supabaseAdmin
    .from('commission_rules')
    .select('commission_percent')
    .eq('shop_id', shopId)
    .or(`valid_until.is.null,valid_until.gt.${now}`)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (specific) return parseFloat(specific.commission_percent);

  const { data: def } = await supabaseAdmin
    .from('commission_rules')
    .select('commission_percent')
    .is('shop_id', null)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  return parseFloat(def?.commission_percent ?? '5.00');
}

// ── 1. Create Razorpay Linked Account ─────────────────────────

/**
 * Create a Razorpay Route linked account for a shop.
 * Must be called once before auto-transfers work for that shop.
 *
 * Idempotent — if a linked account already exists, returns it.
 *
 * @param {string} shopId
 * @returns {{ account_id: string, already_linked?: boolean }}
 */
export async function createLinkedAccount(shopId) {
  // Load shop + owner profile + existing bank account
  const { data: shop, error: shopErr } = await supabaseAdmin
    .from('shops')
    .select(`
      id, name, city,
      profiles!owner_id(email, phone),
      shop_bank_accounts(*)
    `)
    .eq('id', shopId)
    .single();

  if (shopErr || !shop) throw new NotFoundError('Shop', `Shop ${shopId} not found`);

  const bankAccount = shop.shop_bank_accounts?.[0] || shop.shop_bank_accounts;

  if (!bankAccount) {
    throw new ValidationError(
      'Bank account not configured for this shop. ' +
      'The shop owner must submit their bank details first via POST /shop/bank-account.'
    );
  }

  // Already linked — idempotent return
  if (bankAccount.razorpay_account_id) {
    return {
      already_linked:  true,
      account_id:      bankAccount.razorpay_account_id,
      is_verified:     bankAccount.is_verified,
    };
  }

  const ownerEmail = shop.profiles?.email || `shop-${shopId}@tezznirmaan.in`;
  const ownerPhone = shop.profiles?.phone || '';

  // Create Razorpay linked account via Route API
  let linkedAccount;
  try {
    linkedAccount = await razorpay.accounts.create({
      email:               ownerEmail,
      profile: {
        category:    'others',
        subcategory: 'hardware_store',
        addresses: {
          registered: {
            street1:     shop.name,
            city:        shop.city || 'Patna',
            state:       'Bihar',
            postal_code: '800001',
            country:     'IN',
          },
        },
      },
      type:                'route',
      legal_business_name: shop.name,
      business_type:       'individual',
      ...(bankAccount.pan_number && {
        legal_info: { pan: bankAccount.pan_number },
      }),
    });
  } catch (rzpErr) {
    logger.error('payout: Razorpay createLinkedAccount failed', {
      shopId,
      status:  rzpErr.statusCode,
      error:   rzpErr.error?.description || rzpErr.message,
    });
    throw new AppError(
      `Razorpay linked account creation failed: ${rzpErr.error?.description || rzpErr.message}`,
      502
    );
  }

  // Persist the linked account ID
  const { error: updateErr } = await supabaseAdmin
    .from('shop_bank_accounts')
    .update({
      razorpay_account_id: linkedAccount.id,
      is_verified:         false,
      updated_at:          new Date().toISOString(),
    })
    .eq('shop_id', shopId);

  if (updateErr) {
    logger.error('payout: failed to save razorpay_account_id', { shopId, error: updateErr.message });
    throw new AppError('Failed to save linked account ID', 500);
  }

  // Add bank account to the Razorpay linked account
  try {
    await razorpay.accounts.requestProductConfiguration(linkedAccount.id, {
      product_name: 'route',
      requested_at: Math.floor(Date.now() / 1000),
      settlements: {
        account_number: bankAccount.account_number,
        ifsc_code:      bankAccount.ifsc_code,
        beneficiary_name: bankAccount.account_name,
      },
    });
  } catch (productErr) {
    // Non-fatal — account is created, bank details can be added later via Razorpay dashboard
    logger.warn('payout: product configuration failed (non-fatal)', {
      shopId, accountId: linkedAccount.id, error: productErr.message,
    });
  }

  logger.info('payout: Razorpay linked account created', {
    shopId,
    shopName:   shop.name,
    accountId:  linkedAccount.id,
  });

  return { account_id: linkedAccount.id, already_linked: false };
}

// ── 2. Transfer funds after payment capture ────────────────────

/**
 * Transfer the shop's net amount via Razorpay Route.
 * Called by the pg-boss 'route-transfer' worker.
 *
 * @param {string} orderId
 * @param {string} razorpayPaymentId
 * @returns {{ method: 'razorpay_route'|'manual', transfer_id?: string, net_amount_paise?: number }}
 */
export async function transferToShop(orderId, razorpayPaymentId) {
  // Guard: check if a transfer already exists for this payment (idempotency)
  const { data: existing } = await supabaseAdmin
    .from('route_transfers')
    .select('id, status, razorpay_transfer_id')
    .eq('order_id', orderId)
    .eq('razorpay_payment_id', razorpayPaymentId)
    .maybeSingle();

  if (existing && existing.status !== 'failed') {
    logger.info('payout: transfer already exists — skipping duplicate', {
      orderId, existingId: existing.id, status: existing.status,
    });
    return {
      method:           'razorpay_route',
      transfer_id:      existing.razorpay_transfer_id,
      already_processed: true,
    };
  }

  // Load order with shop and bank account details
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select(`
      id, total_amount, order_number, shop_id,
      shops!inner(
        id, name,
        shop_bank_accounts(razorpay_account_id, is_verified)
      )
    `)
    .eq('id', orderId)
    .single();

  if (orderErr || !order) throw new NotFoundError('Order', `Order ${orderId} not found`);

  const shopBankAccount = order.shops?.shop_bank_accounts?.[0]
    ?? order.shops?.shop_bank_accounts;

  const linkedAccountId = shopBankAccount?.razorpay_account_id;

  // ── Graceful fallback: shop not yet on Route ─────────────────
  if (!linkedAccountId) {
    logger.info('payout: shop not on Razorpay Route — falling back to manual settlement', {
      orderId,
      shopId: order.shop_id,
      shopName: order.shops?.name,
    });
    return { method: 'manual' };
  }

  // ── Resolve commission & amounts ─────────────────────────────
  const commissionPercent = await getCommissionPercent(order.shop_id);
  const grossAmount       = Number(order.total_amount);   // already in paise
  const commissionPaise   = Math.floor(grossAmount * commissionPercent / 100);
  const netAmount         = grossAmount - commissionPaise;

  if (netAmount <= 0) {
    logger.warn('payout: net amount is zero — skipping transfer', { orderId, grossAmount, commissionPercent });
    return { method: 'razorpay_route', net_amount_paise: 0, skipped: true };
  }

  // ── Insert pending transfer record (for idempotency tracking) ─
  const { data: transferRow, error: insertErr } = await supabaseAdmin
    .from('route_transfers')
    .insert({
      order_id:            orderId,
      shop_id:             order.shop_id,
      razorpay_payment_id: razorpayPaymentId,
      gross_amount_paise:  grossAmount,
      commission_paise:    commissionPaise,
      net_amount_paise:    netAmount,
      commission_percent:  commissionPercent,
      status:              'pending',
    })
    .select('id')
    .single();

  if (insertErr) {
    // Unique constraint on order_id + razorpay_payment_id — already inserted
    if (insertErr.code === '23505') {
      logger.warn('payout: duplicate transfer insert — already pending', { orderId });
      return { method: 'razorpay_route', skipped: true };
    }
    throw new AppError('Failed to create transfer record: ' + insertErr.message, 500);
  }

  // ── Call Razorpay Route API ───────────────────────────────────
  let rzpTransfer;
  try {
    const response = await razorpay.payments.transfer(razorpayPaymentId, {
      transfers: [{
        account:  linkedAccountId,
        amount:   netAmount,     // paise
        currency: 'INR',
        notes: {
          order_id:           orderId,
          order_number:       order.order_number,
          shop_id:            order.shop_id,
          commission_percent: String(commissionPercent),
        },
        linked_account_notes: ['order_id', 'order_number'],
        on_hold:              false,
      }],
    });

    rzpTransfer = response.items?.[0];
    if (!rzpTransfer?.id) throw new Error('Razorpay returned empty transfer response');

  } catch (rzpErr) {
    // ── Transfer failed — update DB record and alert ─────────
    const errMsg = rzpErr.error?.description || rzpErr.message || 'Unknown Razorpay error';

    await supabaseAdmin
      .from('route_transfers')
      .update({ status: 'failed', error_message: errMsg, updated_at: new Date().toISOString() })
      .eq('id', transferRow.id);

    logger.error('payout: Razorpay transfer failed', {
      orderId, shopId: order.shop_id, netAmount, error: errMsg,
    });

    // Alert the founder so they can intervene manually
    const founderPhone = process.env.FOUNDER_PHONE;
    if (founderPhone) {
      sendSms(
        founderPhone,
        `⚠️ TezzNirmaan: Route transfer FAILED — ` +
        `₹${(netAmount / 100).toFixed(0)} to ${order.shops?.name} ` +
        `(Order #${order.order_number}). Error: ${errMsg.slice(0, 80)}`
      ).catch(() => {});
    }

    throw new AppError(`Route transfer failed: ${errMsg}`, 502);
  }

  // ── Update transfer record with success data ──────────────
  await supabaseAdmin
    .from('route_transfers')
    .update({
      razorpay_transfer_id: rzpTransfer.id,
      status:               'processed',
      transferred_at:       new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    })
    .eq('id', transferRow.id);

  logger.info('payout: Route transfer successful', {
    orderId,
    shopId:        order.shop_id,
    shopName:      order.shops?.name,
    transferId:    rzpTransfer.id,
    netPaise:      netAmount,
    netRupees:     (netAmount / 100).toFixed(2),
    commissionPct: commissionPercent,
  });

  return {
    method:           'razorpay_route',
    transfer_id:      rzpTransfer.id,
    net_amount_paise: netAmount,
    gross_amount_paise: grossAmount,
    commission_paise:   commissionPaise,
  };
}

// ── 3. Webhook handlers ───────────────────────────────────────

/**
 * Handle transfer.processed webhook from Razorpay.
 * Confirms the transfer actually landed in the shop's bank account.
 */
export async function handleTransferProcessed(payload) {
  const transferId = payload?.transfer?.entity?.id;
  if (!transferId) {
    logger.warn('payout: transfer.processed webhook missing transfer ID');
    return;
  }

  const { error } = await supabaseAdmin
    .from('route_transfers')
    .update({
      status:          'processed',
      transferred_at:  new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    })
    .eq('razorpay_transfer_id', transferId);

  if (error) {
    logger.warn('payout: transfer.processed — no matching transfer in DB', { transferId });
  } else {
    logger.info('payout: transfer.processed confirmed', { transferId });
  }
}

/**
 * Handle transfer.failed webhook from Razorpay.
 * Updates DB status and alerts the founder.
 */
export async function handleTransferFailed(payload) {
  const entity    = payload?.transfer?.entity;
  const transferId = entity?.id;
  const errDesc   = entity?.error?.description || 'Unknown error';

  if (!transferId) {
    logger.warn('payout: transfer.failed webhook missing transfer ID');
    return;
  }

  await supabaseAdmin
    .from('route_transfers')
    .update({
      status:        'failed',
      error_message: errDesc,
      updated_at:    new Date().toISOString(),
    })
    .eq('razorpay_transfer_id', transferId);

  // Fetch transfer details for the SMS alert
  const { data: transfer } = await supabaseAdmin
    .from('route_transfers')
    .select('shop_id, net_amount_paise, order_id, shops(name)')
    .eq('razorpay_transfer_id', transferId)
    .single();

  logger.error('payout: transfer.failed webhook received', {
    transferId,
    shopId:  transfer?.shop_id,
    netPaise: transfer?.net_amount_paise,
    error:   errDesc,
  });

  const founderPhone = process.env.FOUNDER_PHONE;
  if (founderPhone && transfer) {
    const rupees = ((transfer.net_amount_paise || 0) / 100).toFixed(0);
    sendSms(
      founderPhone,
      `⚠️ TezzNirmaan: Route transfer FAILED — ₹${rupees} to ` +
      `${transfer.shops?.name || 'shop'}. Error: ${errDesc.slice(0, 80)}. ` +
      `Check /admin/settlements.`
    ).catch(() => {});
  }
}

// ── 4. Admin queries ──────────────────────────────────────────

/**
 * GET /admin/route/transfers
 * List all Route transfers with optional filters.
 */
export async function getRouteTransfers({ shopId, status, page = 1, limit = 50 } = {}) {
  const from = (page - 1) * limit;

  let query = supabaseAdmin
    .from('route_transfers')
    .select(`
      *,
      shops!inner(name, city),
      orders!inner(order_number)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (shopId)  query = query.eq('shop_id', shopId);
  if (status)  query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw error;

  // Summary totals
  const { data: totals } = await supabaseAdmin
    .from('route_transfers')
    .select('status, net_amount_paise, gross_amount_paise, commission_paise');

  const summary = {
    total_transfers:         totals?.length || 0,
    total_gross_paise:       totals?.reduce((s, r) => s + Number(r.gross_amount_paise), 0) || 0,
    total_commission_paise:  totals?.reduce((s, r) => s + Number(r.commission_paise), 0) || 0,
    total_net_paise:         totals?.reduce((s, r) => s + Number(r.net_amount_paise), 0) || 0,
    by_status: {
      processed: totals?.filter(r => r.status === 'processed').length || 0,
      pending:   totals?.filter(r => r.status === 'pending').length || 0,
      failed:    totals?.filter(r => r.status === 'failed').length || 0,
    },
  };

  return {
    transfers:  data || [],
    pagination: { page: +page, limit: +limit, total: count },
    summary,
  };
}

/**
 * GET /admin/route/summary
 * Dashboard widget — today's Route stats + shops on/off Route.
 */
export async function getRouteSummary() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Today's transfers
  const { data: todayTransfers } = await supabaseAdmin
    .from('route_transfers')
    .select('status, gross_amount_paise, net_amount_paise, commission_paise')
    .gte('created_at', todayStart.toISOString());

  // Shops with/without linked accounts
  const { data: allShops } = await supabaseAdmin
    .from('shops')
    .select('id, name, shop_bank_accounts(razorpay_account_id, is_verified)')
    .eq('is_active', true);

  const shopsOnRoute  = (allShops || []).filter(s => s.shop_bank_accounts?.razorpay_account_id);
  const shopsManual   = (allShops || []).filter(s => !s.shop_bank_accounts?.razorpay_account_id);

  return {
    today: {
      transfers_count:     todayTransfers?.length || 0,
      gross_paise:         todayTransfers?.reduce((s, r) => s + Number(r.gross_amount_paise), 0) || 0,
      net_paise:           todayTransfers?.reduce((s, r) => s + Number(r.net_amount_paise), 0) || 0,
      commission_paise:    todayTransfers?.reduce((s, r) => s + Number(r.commission_paise), 0) || 0,
      failed_count:        todayTransfers?.filter(r => r.status === 'failed').length || 0,
    },
    shops: {
      total:      (allShops || []).length,
      on_route:   shopsOnRoute.length,
      on_manual:  shopsManual.length,
      manual_shops: shopsManual.map(s => ({ id: s.id, name: s.name })),
    },
  };
}

// ── 5. Shop-facing queries ─────────────────────────────────────

/**
 * GET /shop/route/transfers
 * Shop owner's own transfer history.
 */
export async function getShopRouteTransfers(shopId, { page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('route_transfers')
    .select('*, orders!inner(order_number)', { count: 'exact' })
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;

  // Weekly summary (current ISO week)
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const { data: weekTransfers } = await supabaseAdmin
    .from('route_transfers')
    .select('net_amount_paise')
    .eq('shop_id', shopId)
    .eq('status', 'processed')
    .gte('created_at', weekStart.toISOString());

  const weekTotal = (weekTransfers || []).reduce((s, r) => s + Number(r.net_amount_paise), 0);

  return {
    transfers:       data || [],
    pagination:      { page: +page, limit: +limit, total: count },
    week_total_paise: weekTotal,
  };
}

// ── 6. Bank account management ────────────────────────────────

/**
 * POST /shop/bank-account
 * Upsert bank account for the authenticated shop.
 */
export async function saveBankAccount(shopId, {
  account_name,
  account_number,
  ifsc_code,
  bank_name,
  account_type = 'savings',
  pan_number,
}) {
  if (!account_name?.trim())   throw new ValidationError('account_name is required');
  if (!account_number?.trim()) throw new ValidationError('account_number is required');
  if (!ifsc_code?.trim())      throw new ValidationError('ifsc_code is required');

  // Validate IFSC format: 4 letters + 0 + 6 alphanumeric
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc_code.trim())) {
    throw new ValidationError('ifsc_code format is invalid (expected: ABCD0123456)');
  }

  const { data, error } = await supabaseAdmin
    .from('shop_bank_accounts')
    .upsert(
      {
        shop_id:        shopId,
        account_name:   account_name.trim(),
        account_number: account_number.trim(),
        ifsc_code:      ifsc_code.trim().toUpperCase(),
        bank_name:      bank_name?.trim() || null,
        account_type,
        pan_number:     pan_number?.trim()?.toUpperCase() || null,
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'shop_id', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) throw new AppError('Failed to save bank account: ' + error.message, 500);

  logger.info('payout: bank account saved', { shopId, ifscCode: ifsc_code });
  return data;
}

/**
 * GET /shop/bank-account
 * Get the shop's bank account with masked account number.
 */
export async function getBankAccount(shopId) {
  const { data, error } = await supabaseAdmin
    .from('shop_bank_accounts')
    .select('*')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Mask account number: show last 4 digits only
  return {
    ...data,
    account_number: data.account_number
      ? 'X'.repeat(Math.max(0, data.account_number.length - 4)) +
        data.account_number.slice(-4)
      : null,
  };
}

// ── 7. Admin reversal ─────────────────────────────────────────

/**
 * POST /admin/route/transfers/:id/reverse
 * Reverse a processed transfer (Razorpay Reversal API).
 * Only possible on 'processed' transfers.
 */
export async function reverseTransfer(routeTransferId, { notes } = {}) {
  const { data: transfer, error } = await supabaseAdmin
    .from('route_transfers')
    .select('*')
    .eq('id', routeTransferId)
    .single();

  if (error || !transfer) throw new NotFoundError('Transfer', 'Route transfer not found');

  if (transfer.status !== 'processed') {
    throw new ValidationError(
      `Cannot reverse a transfer in '${transfer.status}' status. Only 'processed' transfers can be reversed.`
    );
  }

  if (!transfer.razorpay_transfer_id) {
    throw new ValidationError('Transfer has no Razorpay transfer ID — cannot reverse');
  }

  let reversal;
  try {
    reversal = await razorpay.transfers.reverse(transfer.razorpay_transfer_id, {
      amount: transfer.net_amount_paise,  // full reversal
    });
  } catch (rzpErr) {
    const errMsg = rzpErr.error?.description || rzpErr.message;
    logger.error('payout: reversal failed', { routeTransferId, error: errMsg });
    throw new AppError(`Reversal failed: ${errMsg}`, 502);
  }

  await supabaseAdmin
    .from('route_transfers')
    .update({
      status:     'reversed',
      error_message: notes || `Reversed by admin. Razorpay reversal ID: ${reversal.id}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', routeTransferId);

  logger.info('payout: transfer reversed', {
    routeTransferId,
    razorpayTransferId: transfer.razorpay_transfer_id,
    reversalId:         reversal.id,
    paise:              transfer.net_amount_paise,
  });

  return { reversal_id: reversal.id, reversed_paise: transfer.net_amount_paise };
}
