// ────────────────────────────────────────────────────────────
// Wallet API Client — P3-C
// ────────────────────────────────────────────────────────────
import { client } from './client';

/**
 * GET /customer/wallet?limit=N
 * Returns { balance_paise, lifetime_earned_paise, lifetime_spent_paise, transactions[] }
 */
export const getWallet = (limit = 20) =>
  client.get('/customer/wallet', { params: { limit } });

/**
 * POST /customer/wallet/applicable
 * Body: { total_paise }
 * Returns { applicable: boolean, max_usable_paise: number, balance_paise: number }
 */
export const getApplicableWalletAmount = (totalPaise) =>
  client.post('/customer/wallet/applicable', { total_paise: totalPaise });
