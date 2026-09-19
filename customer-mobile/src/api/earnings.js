// ────────────────────────────────────────────────────────────
// Rider Earnings API Client — P2-B / P6-4
// ────────────────────────────────────────────────────────────
import { client } from './client';

/**
 * GET /rider/earnings
 * Returns: { today, week, pending, dailyChart, paymentHistory }
 */
export const getRiderEarnings = () => client.get('/rider/earnings');

/**
 * GET /rider/earnings/history?page=&limit=
 * Returns: { batches[], total, page, limit, hasMore }
 * Use for infinite-scroll on the Payout History section.
 */
export const getPayoutHistory = (page = 1, limit = 10) =>
  client.get(`/rider/earnings/history?page=${page}&limit=${limit}`);
