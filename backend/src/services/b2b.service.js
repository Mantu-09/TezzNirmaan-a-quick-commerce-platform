// ────────────────────────────────────────────────────────────
// B2B Service — P6-6
//
// Handles:
//   • Contractor account application + admin approval/rejection
//   • Applying contractor benefits (discount, credit) at checkout
//   • Creating b2b_orders and linking to regular orders
//   • GST invoice number generation + PDF creation
//   • Credit ledger: recording outstanding + marking paid
//   • Overdue detection
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ── Contractor Profile ─────────────────────────────────────────

/**
 * Apply for a contractor account.
 * One application per user — idempotent check guards duplicates.
 */
export async function applyForContractorAccount(userId, {
  companyName,
  gstNumber,
  panNumber,
  monthlyVolumeBand,
  requestedPaymentTerms,
}) {
  // Block duplicate applications
  const { data: existing } = await supabaseAdmin
    .from('contractor_profiles')
    .select('id, is_verified')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (existing.is_verified) throw new AppError('You already have an active contractor account.', 409);
    throw new AppError('Your contractor application is already under review.', 409);
  }

  const { data, error } = await supabaseAdmin
    .from('contractor_profiles')
    .insert({
      user_id:              userId,
      company_name:         companyName,
      gst_number:           gstNumber    || null,
      pan_number:           panNumber    || null,
      monthly_volume_band:  monthlyVolumeBand  || null,
      payment_terms_days:   requestedPaymentTerms || 0,
    })
    .select()
    .single();

  if (error) throw error;
  logger.info('Contractor application submitted', { userId, companyName });
  return data;
}

/**
 * Get the contractor profile for a user (or null if none).
 */
export async function getContractorProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('contractor_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ── Checkout Integration ───────────────────────────────────────

/**
 * Check if a user is a verified contractor and return their benefits.
 * Called before order placement to compute discount + credit availability.
 *
 * @returns {{ isContractor, discountPercent, discountPaise, creditAvailablePaise, paymentTermsDays, gstNumber }}
 */
export async function getContractorBenefits(userId, orderTotalPaise) {
  const { data: profile } = await supabaseAdmin
    .from('contractor_profiles')
    .select('id, discount_percent, credit_limit_paise, outstanding_credit_paise, payment_terms_days, gst_number')
    .eq('user_id', userId)
    .eq('is_verified', true)
    .maybeSingle();

  if (!profile) {
    return { isContractor: false, discountPercent: 0, discountPaise: 0, creditAvailablePaise: 0, paymentTermsDays: 0, gstNumber: null };
  }

  const discountPaise       = Math.floor(orderTotalPaise * Number(profile.discount_percent) / 100);
  const creditAvailablePaise = Math.max(0, profile.credit_limit_paise - profile.outstanding_credit_paise);

  return {
    isContractor:          true,
    contractorId:          profile.id,
    discountPercent:       Number(profile.discount_percent),
    discountPaise,
    creditAvailablePaise,
    paymentTermsDays:      profile.payment_terms_days,
    gstNumber:             profile.gst_number,
  };
}

// ── B2B Order Creation ────────────────────────────────────────

/**
 * Create a b2b_orders row after a contractor places an order.
 * Called from the order service after the base order is created.
 */
export async function createB2BOrder(orderId, contractorId, {
  poNumber,
  paymentTermsDays,
}) {
  // Calculate due date
  const dueDate = paymentTermsDays > 0
    ? new Date(Date.now() + paymentTermsDays * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10)
    : null;

  const { data, error } = await supabaseAdmin
    .from('b2b_orders')
    .insert({
      order_id:           orderId,
      contractor_id:      contractorId,
      po_number:          poNumber || null,
      payment_terms_days: paymentTermsDays,
      due_date:           dueDate,
    })
    .select()
    .single();

  if (error) throw error;

  // If credit order: add to outstanding balance via DB function
  if (paymentTermsDays > 0) {
    // Outstanding will be updated properly after GST invoice is generated
    // with the final invoice total. No pre-credit needed here.
  }

  return data;
}

// ── GST Invoice Generation ────────────────────────────────────

/**
 * Get the next sequential invoice number.
 * Format: TN-GST-YYYY-XXXX (e.g. TN-GST-2026-0042)
 */
async function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const { count } = await supabaseAdmin
    .from('gst_invoices')
    .select('id', { count: 'exact', head: true });

  const seq = String((count || 0) + 1).padStart(4, '0');
  return `TN-GST-${year}-${seq}`;
}

/**
 * Generate a GST invoice for a B2B order.
 * Returns { invoiceNumber, id } — PDF is generated separately by the job queue.
 */
export async function generateGSTInvoice(b2bOrderId, { shopId, contractorId, subtotalPaise, gstRate = 18.00 }) {
  const invoiceNumber  = await getNextInvoiceNumber();
  const gstAmountPaise = Math.round(subtotalPaise * gstRate / 100);
  const totalPaise     = subtotalPaise + gstAmountPaise;

  const { data: invoice, error } = await supabaseAdmin
    .from('gst_invoices')
    .insert({
      b2b_order_id:     b2bOrderId,
      invoice_number:   invoiceNumber,
      shop_id:          shopId,
      contractor_id:    contractorId,
      subtotal_paise:   subtotalPaise,
      gst_rate:         gstRate,
      gst_amount_paise: gstAmountPaise,
      total_paise:      totalPaise,
    })
    .select()
    .single();

  if (error) throw error;

  // Link invoice number back to the b2b_order row
  await supabaseAdmin
    .from('b2b_orders')
    .update({ gst_invoice_number: invoiceNumber })
    .eq('id', b2bOrderId);

  logger.info('GST invoice created', { invoiceNumber, totalPaise });

  // Update contractor outstanding to the actual invoice total (atomic via DB function)
  await supabaseAdmin
    .rpc('increment_contractor_outstanding', {
      p_contractor_id: contractorId,
      p_amount_paise:  totalPaise,
    })
    .catch(err => logger.warn('B2B: outstanding increment failed after invoice', { err: err.message }));

  return { invoiceNumber, id: invoice.id, totalPaise };
}

/**
 * Attach a PDF URL to an existing invoice.
 * Called by the PDF generation job after upload to Supabase Storage.
 */
export async function attachInvoicePdf(invoiceId, pdfUrl) {
  const { error } = await supabaseAdmin
    .from('gst_invoices')
    .update({ pdf_url: pdfUrl })
    .eq('id', invoiceId);
  if (error) throw error;
}

// ── Invoice Listing ───────────────────────────────────────────

export async function listInvoices(userId, { page = 1, limit = 20 } = {}) {
  const profile = await getContractorProfile(userId);
  if (!profile) throw new NotFoundError('No contractor account found');

  const from = (page - 1) * limit;
  const { data, error, count } = await supabaseAdmin
    .from('gst_invoices')
    .select('*, b2b_orders(po_number, payment_status, due_date)', { count: 'exact' })
    .eq('contractor_id', profile.id)
    .order('issued_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;
  return { invoices: data || [], total: count || 0, page, limit, hasMore: from + (data?.length || 0) < (count || 0) };
}

export async function getInvoice(invoiceId, userId) {
  const { data, error } = await supabaseAdmin
    .from('gst_invoices')
    .select('*, b2b_orders(*, orders(order_number, created_at))')
    .eq('id', invoiceId)
    .single();

  if (error || !data) throw new NotFoundError('Invoice not found');

  // Security: verify ownership
  const profile = await getContractorProfile(userId);
  if (!profile || data.contractor_id !== profile.id) {
    throw new AppError('Access denied', 403);
  }
  return data;
}

// ── Admin: Application Management ────────────────────────────

export async function listApplications({ status = 'pending', page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;
  let q = supabaseAdmin
    .from('contractor_profiles')
    .select(`
      id, company_name, gst_number, pan_number,
      monthly_volume_band, payment_terms_days,
      is_verified, rejection_reason, created_at, updated_at,
      profiles!user_id(id, full_name, phone, email)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (status === 'pending')  q = q.eq('is_verified', false).is('rejection_reason', null);
  if (status === 'verified') q = q.eq('is_verified', true);
  if (status === 'rejected') q = q.not('rejection_reason', 'is', null);

  const { data, error, count } = await q;
  if (error) throw error;
  return { applications: data || [], total: count || 0, page, limit };
}

export async function approveApplication(contractorId, adminUserId, {
  creditLimitPaise,
  paymentTermsDays,
  discountPercent,
}) {
  const { data, error } = await supabaseAdmin
    .from('contractor_profiles')
    .update({
      is_verified:          true,
      rejection_reason:     null,
      credit_limit_paise:   creditLimitPaise   ?? 0,
      payment_terms_days:   paymentTermsDays    ?? 0,
      discount_percent:     discountPercent     ?? 0,
      verified_at:          new Date().toISOString(),
      verified_by:          adminUserId,
      updated_at:           new Date().toISOString(),
    })
    .eq('id', contractorId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new NotFoundError('Contractor profile not found');
  logger.info('Contractor approved', { contractorId, adminUserId, creditLimitPaise, paymentTermsDays });
  return data;
}

export async function rejectApplication(contractorId, adminUserId, { reason }) {
  if (!reason?.trim()) throw new AppError('Rejection reason is required', 400);

  const { data, error } = await supabaseAdmin
    .from('contractor_profiles')
    .update({
      is_verified:      false,
      rejection_reason: reason,
      verified_at:      new Date().toISOString(),
      verified_by:      adminUserId,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', contractorId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new NotFoundError('Contractor profile not found');
  logger.info('Contractor rejected', { contractorId, adminUserId, reason });
  return data;
}

// ── Admin: Overdue Credit Accounts ───────────────────────────

export async function listOverdueAccounts() {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('b2b_orders')
    .select(`
      id, order_id, due_date, payment_terms_days, created_at,
      contractor_profiles!contractor_id(
        id, company_name, gst_number,
        outstanding_credit_paise, credit_limit_paise,
        profiles!user_id(full_name, phone)
      ),
      orders!order_id(order_number, total_amount_paise)
    `)
    .eq('payment_status', 'pending')
    .lte('due_date', today)
    .order('due_date', { ascending: true });

  if (error) throw error;

  // Mark overdue in DB (fire-and-forget)
  if (data?.length) {
    const ids = data.map(r => r.id);
    supabaseAdmin
      .from('b2b_orders')
      .update({ payment_status: 'overdue' })
      .in('id', ids)
      .then()
      .catch(err => logger.warn('B2B: failed to mark overdue', { err: err.message }));
  }

  return data || [];
}

/**
 * Mark a B2B order as paid and clear outstanding credit.
 */
export async function markB2BOrderPaid(b2bOrderId, adminUserId) {
  const { data: b2bOrder, error: fetchErr } = await supabaseAdmin
    .from('b2b_orders')
    .select('*, orders!order_id(total_amount_paise)')
    .eq('id', b2bOrderId)
    .single();

  if (fetchErr || !b2bOrder) throw new NotFoundError('B2B order not found');

  const amountPaise = b2bOrder.orders?.total_amount_paise || 0;

  // Update payment status
  const { error } = await supabaseAdmin
    .from('b2b_orders')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', b2bOrderId);

  if (error) throw error;

  // Reduce outstanding balance (atomic via DB function)
  await supabaseAdmin
    .rpc('decrement_contractor_outstanding', {
      p_contractor_id: b2bOrder.contractor_id,
      p_amount_paise:  amountPaise,
    })
    .catch(err => logger.warn('B2B: outstanding decrement failed', { err: err.message }));

  logger.info('B2B order marked paid', { b2bOrderId, adminUserId, amountPaise });
  return { success: true };
}
