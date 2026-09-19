// ────────────────────────────────────────────────────────────
// B2B Controller — P6-6
// Customer endpoints + Admin endpoints (same file, separate exports)
// ────────────────────────────────────────────────────────────
import * as b2b from '../services/b2b.service.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ══════════════════════════════════════════════════════════
// CUSTOMER ENDPOINTS
// ══════════════════════════════════════════════════════════

/** POST /customer/b2b/apply */
export async function applyForContractor(req, res, next) {
  try {
    const {
      companyName,
      gstNumber,
      panNumber,
      monthlyVolumeBand,
      requestedPaymentTerms,
    } = req.body;

    if (!companyName?.trim()) throw new AppError('Company name is required', 400);

    const profile = await b2b.applyForContractorAccount(req.user.id, {
      companyName: companyName.trim(),
      gstNumber:   gstNumber?.trim() || null,
      panNumber:   panNumber?.trim() || null,
      monthlyVolumeBand,
      requestedPaymentTerms: parseInt(requestedPaymentTerms) || 0,
    });

    res.status(201).json({
      success: true,
      data: { profile, message: 'Application submitted. Verification takes 1–2 business days.' },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /customer/b2b/profile */
export async function getContractorProfile(req, res, next) {
  try {
    const profile = await b2b.getContractorProfile(req.user.id);
    if (!profile) {
      return res.json({ success: true, data: { profile: null, isContractor: false } });
    }

    const creditAvailablePaise = Math.max(
      0,
      profile.credit_limit_paise - profile.outstanding_credit_paise
    );

    res.json({
      success: true,
      data: {
        profile,
        isContractor:          profile.is_verified,
        creditAvailablePaise,
        discountPercent:       Number(profile.discount_percent),
      },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /customer/b2b/benefits?orderTotal=<paise>  — called from checkout screen */
export async function getCheckoutBenefits(req, res, next) {
  try {
    const orderTotalPaise = parseInt(req.query.orderTotal) || 0;
    const benefits = await b2b.getContractorBenefits(req.user.id, orderTotalPaise);
    res.json({ success: true, data: benefits });
  } catch (err) {
    next(err);
  }
}

/** GET /customer/b2b/invoices */
export async function listInvoices(req, res, next) {
  try {
    const page  = Math.max(1,  parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const result = await b2b.listInvoices(req.user.id, { page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/** GET /customer/b2b/invoices/:invoiceId */
export async function getInvoice(req, res, next) {
  try {
    const invoice = await b2b.getInvoice(req.params.invoiceId, req.user.id);
    res.json({ success: true, data: { invoice } });
  } catch (err) {
    next(err);
  }
}

// ══════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ══════════════════════════════════════════════════════════

/** GET /admin/b2b/applications?status=pending|verified|rejected */
export async function listApplications(req, res, next) {
  try {
    const page   = Math.max(1,  parseInt(req.query.page)   || 1);
    const limit  = Math.min(50, parseInt(req.query.limit)  || 20);
    const status = req.query.status || 'pending';

    if (!['pending', 'verified', 'rejected'].includes(status)) {
      throw new AppError('status must be pending, verified, or rejected', 400);
    }

    const result = await b2b.listApplications({ status, page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/** PATCH /admin/b2b/applications/:contractorId/approve */
export async function approveApplication(req, res, next) {
  try {
    const { creditLimitPaise, paymentTermsDays, discountPercent } = req.body;
    const result = await b2b.approveApplication(
      req.params.contractorId,
      req.user.id,
      {
        creditLimitPaise:   parseInt(creditLimitPaise) || 0,
        paymentTermsDays:   parseInt(paymentTermsDays) || 0,
        discountPercent:    parseFloat(discountPercent) || 0,
      }
    );
    res.json({ success: true, data: { profile: result } });
  } catch (err) {
    next(err);
  }
}

/** PATCH /admin/b2b/applications/:contractorId/reject */
export async function rejectApplication(req, res, next) {
  try {
    const result = await b2b.rejectApplication(
      req.params.contractorId,
      req.user.id,
      { reason: req.body.reason }
    );
    res.json({ success: true, data: { profile: result } });
  } catch (err) {
    next(err);
  }
}

/** GET /admin/b2b/outstanding */
export async function listOutstanding(req, res, next) {
  try {
    const overdue = await b2b.listOverdueAccounts();
    res.json({ success: true, data: { overdue, count: overdue.length } });
  } catch (err) {
    next(err);
  }
}

/** PATCH /admin/b2b/orders/:b2bOrderId/paid */
export async function markPaid(req, res, next) {
  try {
    const result = await b2b.markB2BOrderPaid(req.params.b2bOrderId, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── P12-7: Project management ─────────────────────────────────

/** GET /customer/b2b/projects */
export async function listProjects(req, res, next) {
  try {
    const { supabaseAdmin } = await import('../config/supabase.js');

    // Get contractor_id for this user
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('contractor_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (pErr || !profile) return res.json({ data: { projects: [] } });

    const { data: projects, error } = await supabaseAdmin
      .from('contractor_projects')
      .select('*')
      .eq('contractor_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data: { projects: projects || [] } });
  } catch (err) {
    next(err);
  }
}

/** POST /customer/b2b/projects */
export async function createProject(req, res, next) {
  try {
    const { name, description, site_address, budget_paise } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Project name is required' });

    const { supabaseAdmin } = await import('../config/supabase.js');

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('contractor_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (pErr || !profile) return res.status(403).json({ message: 'No contractor profile found. Apply for B2B first.' });

    const { data, error } = await supabaseAdmin
      .from('contractor_projects')
      .insert({
        contractor_id: profile.id,
        name:          name.trim(),
        description:   description?.trim() || null,
        site_address:  site_address?.trim() || null,
        budget_paise:  budget_paise || null,
        status:        'active',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data: data, message: 'Project created' });
  } catch (err) {
    next(err);
  }
}

/** PATCH /customer/b2b/projects/:id */
export async function updateProject(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, site_address, budget_paise, status } = req.body;

    const { supabaseAdmin } = await import('../config/supabase.js');

    const { data: profile } = await supabaseAdmin
      .from('contractor_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (!profile) return res.status(403).json({ message: 'No contractor profile' });

    const updates = {};
    if (name)          updates.name         = name.trim();
    if (description)   updates.description  = description.trim();
    if (site_address)  updates.site_address = site_address.trim();
    if (budget_paise)  updates.budget_paise = budget_paise;
    if (status)        updates.status       = status;

    const { data, error } = await supabaseAdmin
      .from('contractor_projects')
      .update(updates)
      .eq('id', id)
      .eq('contractor_id', profile.id) // Ownership check
      .select()
      .single();

    if (error) throw error;
    if (!data)  return res.status(404).json({ message: 'Project not found' });
    res.json({ data, message: 'Project updated' });
  } catch (err) {
    next(err);
  }
}
