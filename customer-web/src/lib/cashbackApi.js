// dashboard/src/lib/cashbackApi.js — P4-2B (fixed P20: was importing non-existent `apiClient`, now uses fetch)
// Cashback Rule admin API helpers for the Next.js dashboard.
// All calls go to /admin/cashback/* which requires platform_admin role.

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

async function adminFetch(method, path, body) {
  const token = getToken();
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/backend${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Request failed');
  return json;
}

/** Fetch all cashback rules (active + inactive) for admin view. */
export async function fetchCashbackRules() {
  const json = await adminFetch('GET', '/admin/cashback/rules');
  return json.data?.rules || json.data || [];
}

/**
 * Create a new cashback rule.
 * @param {{ min_order_paise: number, max_order_paise: number|null, cashback_percent: number, shop_id: string|null }} rule
 */
export async function createCashbackRule(rule) {
  const json = await adminFetch('POST', '/admin/cashback/rules', rule);
  return json.data?.rule || json.data;
}

/**
 * Update an existing cashback rule.
 * @param {string} ruleId
 * @param {{ cashback_percent?: number, is_active?: boolean, valid_until?: string }} updates
 */
export async function updateCashbackRule(ruleId, updates) {
  const json = await adminFetch('PATCH', `/admin/cashback/rules/${ruleId}`, updates);
  return json.data?.rule || json.data;
}

/**
 * Soft-delete (deactivate) a cashback rule.
 * @param {string} ruleId
 */
export async function deleteCashbackRule(ruleId) {
  const json = await adminFetch('DELETE', `/admin/cashback/rules/${ruleId}`);
  return json.data?.rule || json.data;
}

/**
 * Preview cashback for a given order amount.
 * @param {number} amountPaise
 * @param {string|null} shopId
 */
export async function previewCashback(amountPaise, shopId = null) {
  const params = new URLSearchParams({ amount: amountPaise });
  if (shopId) params.set('shop_id', shopId);
  const json = await adminFetch('GET', `/admin/cashback/preview?${params}`);
  return json.data;
}
