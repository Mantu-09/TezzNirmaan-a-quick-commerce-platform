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

/**
 * GET /customer/loyalty
 * Returns { total_stamps, current_cycle, stamps_per_reward, stamps_to_next,
 *           rewards_earned, reward_type, recent_stamps[] }
 * 5 stamps = 1 free delivery reward
 */
export const getLoyalty = () =>
  client.get('/customer/loyalty');
