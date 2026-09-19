// backend/src/services/whatsapp-broadcast.service.js — P17-7
// WhatsApp marketing broadcasts via WATI.io bulk send API.
// Segments: inactive users, high-value customers, B2B contractors, city-specific.

import { supabaseAdmin } from '../config/supabase.js';

const WATI_URL   = process.env.WATI_API_URL   || '';
const WATI_TOKEN = process.env.WATI_API_TOKEN || '';

// ── Fetch audience segments ──────────────────────────────────────

export async function getSegmentPhones(segment) {
  try {
    if (segment === 'inactive_7d') {
      // Users who ordered before but not in the last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('phone')
        .lt('last_order_at', sevenDaysAgo)
        .not('last_order_at', 'is', null)
        .limit(500);
      return (data || []).map(p => p.phone).filter(Boolean);
    }

    if (segment === 'inactive_30d') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('phone')
        .lt('last_order_at', thirtyDaysAgo)
        .not('last_order_at', 'is', null)
        .limit(500);
      return (data || []).map(p => p.phone).filter(Boolean);
    }

    if (segment === 'high_value') {
      // Customers with lifetime order value > Rs.5000
      const { data } = await supabaseAdmin
        .from('orders')
        .select('profiles(phone)')
        .neq('status', 'cancelled')
        .gte('total_amount', 500000) // 5000 rupees in paise
        .limit(500);
      return [...new Set((data || []).map(o => o.profiles?.phone).filter(Boolean))];
    }

    if (segment === 'b2b_contractors') {
      const { data } = await supabaseAdmin
        .from('contractor_profiles')
        .select('profiles:user_id(phone)')
        .eq('is_verified', true)
        .limit(200);
      return (data || []).map(c => c.profiles?.phone).filter(Boolean);
    }

    if (segment.startsWith('city:')) {
      const citySlug = segment.replace('city:', '');
      const { data: city } = await supabaseAdmin
        .from('cities')
        .select('id')
        .eq('slug', citySlug)
        .single();
      if (!city) return [];
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('phone')
        .eq('city_id', city.id)
        .limit(500);
      return (data || []).map(p => p.phone).filter(Boolean);
    }

    if (segment === 'all_customers') {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('phone')
        .not('phone', 'is', null)
        .limit(1000);
      return (data || []).map(p => p.phone).filter(Boolean);
    }

    return [];
  } catch (err) {
    console.error('[Broadcast] getSegmentPhones error:', err.message);
    return [];
  }
}

/**
 * sendBroadcast(phones[], templateName, params{})
 * Uses WATI bulk send API — sends to up to 500 numbers.
 * Returns: { sent, failed, total }
 */
export async function sendBroadcast(phones, templateName, params = {}) {
  if (!WATI_URL || !WATI_TOKEN) {
    console.log(`[Broadcast] No WATI config — would send "${templateName}" to ${phones.length} numbers`);
    return { sent: 0, failed: 0, total: phones.length, dry_run: true };
  }

  const results = { sent: 0, failed: 0, total: phones.length };
  const batchSize = 50; // WATI rate limit

  for (let i = 0; i < phones.length; i += batchSize) {
    const batch = phones.slice(i, i + batchSize);
    try {
      const res = await fetch(`${WATI_URL}/api/v1/sendTemplateMessages`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: templateName,
          broadcast_name: `broadcast_${Date.now()}`,
          receivers: batch.map(phone => ({
            whatsappNumber: phone.replace(/\D/g, ''),
            customParams: Object.entries(params).map(([name, value]) => ({ name, value: String(value) })),
          })),
        }),
      });
      if (res.ok) results.sent += batch.length;
      else results.failed += batch.length;
    } catch {
      results.failed += batch.length;
    }
    // Small delay between batches
    if (i + batchSize < phones.length) await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

/**
 * getEstimatedReach(segment)
 * Returns phone count without sending.
 */
export async function getEstimatedReach(segment) {
  const phones = await getSegmentPhones(segment);
  return phones.length;
}

// Pre-built campaign templates (must be pre-approved in WATI dashboard)
export const BROADCAST_TEMPLATES = {
  reactivation: {
    name:    'customer_reactivation',
    label:   'Win-Back (Inactive 7 days)',
    params:  ['customer_name', 'discount_code', 'expiry_date'],
    preview: 'Hi {{customer_name}}! We miss you at TezzNirmaan. Use code {{discount_code}} for 10% off your next order. Valid till {{expiry_date}}.',
  },
  flash_sale: {
    name:    'flash_sale_alert',
    label:   'Flash Sale Alert',
    params:  ['discount_pct', 'end_time', 'shop_url'],
    preview: 'FLASH SALE: {{discount_pct}}% off all cement & paint orders. Ends {{end_time}}. Order now: {{shop_url}}',
  },
  b2b_credit: {
    name:    'b2b_credit_offer',
    label:   'B2B Credit Offer',
    params:  ['company_name', 'credit_limit', 'payment_terms'],
    preview: 'Hi {{company_name}}! Get ₹{{credit_limit}} credit line with {{payment_terms}}-day payment terms on TezzNirmaan. Apply at tezznirmaan.com/b2b',
  },
  monsoon_prep: {
    name:    'monsoon_preparation',
    label:   'Monsoon Preparation',
    params:  ['city_name'],
    preview: 'Monsoon is here! Stock up on waterproofing & drainage supplies in {{city_name}}. Free delivery above ₹999. Shop: tezznirmaan.com',
  },
};
