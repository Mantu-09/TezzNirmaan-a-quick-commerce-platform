// ────────────────────────────────────────────────────────────
// B2B API Client — P6-6
// ────────────────────────────────────────────────────────────
import { client } from './client';

/** POST /customer/b2b/apply */
export const applyForContractor = (body) => client.post('/b2b/apply', body);

/** GET /customer/b2b/profile */
export const getContractorProfile = () => client.get('/b2b/profile');

/**
 * GET /customer/b2b/benefits?orderTotal=<paise>
 * Returns { isContractor, discountPercent, discountPaise, creditAvailablePaise, paymentTermsDays }
 */
export const getCheckoutBenefits = (orderTotalPaise) =>
  client.get(`/b2b/benefits?orderTotal=${orderTotalPaise}`);

/** GET /customer/b2b/invoices */
export const listInvoices = (page = 1) => client.get(`/b2b/invoices?page=${page}`);

/** GET /customer/b2b/invoices/:id */
export const getInvoice = (invoiceId) => client.get(`/b2b/invoices/${invoiceId}`);
