// ────────────────────────────────────────────────────────────
// Job Queue — P1-E
//
// Uses pg-boss to run background jobs backed by PostgreSQL.
// This means job persistence, retry with backoff, and a dead-
// letter queue — all without a separate Redis/BullMQ stack.
//
// GRACEFUL DEGRADATION:
//   If DATABASE_URL is not set (e.g. local dev without pooler
//   URL configured), the queue silently disables itself and
//   callers fall back to synchronous fire-and-forget delivery.
//   Set DATABASE_URL to the Supabase connection pooler URL to
//   enable the queue.
//
// DATABASE_URL format:
//   postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
//   (Session mode pooler, port 5432 — find in Supabase → Connect → Session pooler)
//   DO NOT use Transaction pooler (port 6543) — pg-boss holds persistent
//   connections which are incompatible with transaction-mode pooling.
// ────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

// pg-boss is loaded lazily inside initQueue() so Jest can mock it
// and so the module never crashes if pg-boss is absent in test environments.
let PgBoss = null;

// ── Queue names ───────────────────────────────────────────────
export const QUEUES = {
  SEND_NOTIFICATION:     'send-notification',
  SEND_SMS:              'send-sms',
  REFRESH_RATINGS:       'refresh-ratings',
  EXPIRE_WALLET_CREDITS: 'expire-wallet-credits', // P4-1C
  PROCESS_REFERRAL:      'process-referral-reward', // P4-2A
  PROCESS_CASHBACK:      'process-cashback-reward',  // P4-2B
  WEEKLY_SETTLEMENTS:    'weekly-settlements',        // P4-4B
  EXPIRE_REFERRAL_EVENTS:   'expire-referral-events',    // P5-0D Bug 2
  PRUNE_RIDER_LOCATIONS:    'prune-rider-locations',      // P5-1
  EXPIRE_SUBSCRIPTIONS:     'expire-subscriptions',       // P5-3: TezzPass daily expiry
  CHECK_FAILED_JOBS:        'check-failed-jobs',          // P5-4B: DLQ alerting
  LOW_STOCK_ALERT:          'low-stock-alert',            // P5-5A: Inventory alerts
};

// ── Default retry policy ──────────────────────────────────────
// Applied to every job send() call.
// Retries: ~0s → 30s → 60s (exponential backoff)
const DEFAULT_JOB_OPTIONS = {
  retryLimit:   3,
  retryDelay:   30,    // seconds before first retry
  retryBackoff: true,  // doubles each attempt: 30s, 60s, 120s
  expireInHours: 24,   // abandon if not completed within 24 h
};

// ── Singleton ─────────────────────────────────────────────────
let boss = null;
let queueEnabled = false;

/**
 * Start pg-boss and register all workers.
 * Called once from server.js during startup.
 * Safe to call multiple times — idempotent after first call.
 */
export async function initQueue() {
  if (boss) return boss;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    logger.warn(
      'P1-E: DATABASE_URL not set — job queue disabled. ' +
      'Notifications will use synchronous fire-and-forget delivery. ' +
      'To enable: set DATABASE_URL to your Supabase pooler URL.'
    );
    return null;
  }

  try {
    // Lazy-load pg-boss so Jest can mock it via moduleNameMapper
    if (!PgBoss) {
      const mod = await import('pg-boss');
      PgBoss = mod.default || mod.PgBoss;
    }
    boss = new PgBoss({
      connectionString: dbUrl,
      // pg-boss manages its own schema (pgboss.*) in your database
      schema: 'pgboss',
      // Archive completed jobs after 7 days (prevents table bloat)
      archiveCompletedAfterSeconds: 7 * 24 * 60 * 60,
      // Delete failed jobs after 30 days
      deleteAfterSeconds: 30 * 24 * 60 * 60,
      // Monitoring interval
      monitorStateIntervalSeconds: 60,
      // Prevent pg-boss from crashing on unhandled worker errors
      onComplete: false,
    });

    boss.on('error', (err) => {
      logger.error('pg-boss internal error', { error: err.message });
    });

    await boss.start();
    queueEnabled = true;
    logger.info('P1-E: Job queue started (pg-boss)');

    await _registerWorkers();
    return boss;
  } catch (err) {
    logger.error('P1-E: Failed to start job queue — falling back to sync delivery', {
      error: err.message,
    });
    boss = null;
    queueEnabled = false;
    return null;
  }
}

/**
 * Get the running boss instance.
 * Returns null if queue is disabled (DATABASE_URL not set or startup failed).
 */
export function getQueue() {
  return queueEnabled ? boss : null;
}

/**
 * Returns true if the job queue is running and healthy.
 */
export function isQueueEnabled() {
  return queueEnabled;
}

// ── Job Senders ───────────────────────────────────────────────

/**
 * Enqueue a notification delivery job.
 * Falls back gracefully if queue is disabled.
 *
 * @param {string} userId
 * @param {string} type
 * @param {string} title
 * @param {string} body
 * @param {object} data
 * @returns {string|null} job ID, or null if queued synchronously
 */
export async function enqueueNotification(userId, type, title, body, data = {}) {
  const queue = getQueue();
  if (!queue) return null; // caller handles fallback

  try {
    const jobId = await queue.send(
      QUEUES.SEND_NOTIFICATION,
      { userId, type, title, body, data },
      DEFAULT_JOB_OPTIONS,
    );
    logger.debug('Notification enqueued', { jobId, userId, type });
    return jobId;
  } catch (err) {
    logger.error('Failed to enqueue notification', { userId, type, error: err.message });
    return null; // caller handles fallback
  }
}

/**
 * Enqueue an SMS send job.
 *
 * @param {string} phone
 * @param {string} message
 */
export async function enqueueSms(phone, message) {
  const queue = getQueue();
  if (!queue) return null;

  try {
    return await queue.send(
      QUEUES.SEND_SMS,
      { phone, message },
      { ...DEFAULT_JOB_OPTIONS, retryLimit: 5 }, // SMS gets more retries
    );
  } catch (err) {
    logger.error('Failed to enqueue SMS', { phone: phone?.slice(-4), error: err.message });
    return null;
  }
}

/**
 * Enqueue a ratings refresh job (debounced via singleton key).
 * pg-boss will de-duplicate if a job with the same key is already queued.
 */
export async function enqueueRatingsRefresh() {
  const queue = getQueue();
  if (!queue) return null;

  try {
    return await queue.sendOnce(
      QUEUES.REFRESH_RATINGS,
      {},
      { ...DEFAULT_JOB_OPTIONS, retryLimit: 2 },
      'singleton-ratings-refresh',  // dedup key — only one refresh at a time
    );
  } catch (err) {
    logger.error('Failed to enqueue ratings refresh', { error: err.message });
    return null;
  }
}

/**
 * P4-2A: Enqueue a referral reward check after order placement.
 */
export async function enqueueReferralReward(userId, orderId) {
  const queue = getQueue();
  if (!queue) {
    const { processReferralReward } = await import('../services/referral.service.js');
    processReferralReward(userId, orderId).catch(e =>
      logger.warn('referral reward (sync fallback) failed', { error: e.message })
    );
    return null;
  }
  try {
    return await queue.send(
      QUEUES.PROCESS_REFERRAL,
      { userId, orderId },
      { ...DEFAULT_JOB_OPTIONS, retryLimit: 5 },
    );
  } catch (err) {
    logger.error('Failed to enqueue referral reward', { userId, orderId, error: err.message });
    return null;
  }
}

/**
 * P4-2B: Enqueue a cashback award after delivery confirmation.
 * Idempotent — the worker's awardCashback() guards against double-credit.
 *
 * @param {string} userId
 * @param {string} orderId
 * @param {string} orderNumber   — used for wallet transaction description
 * @param {number} orderAmountPaise
 * @param {string|null} shopId   — for shop-specific rule lookup
 */
export async function enqueueCashbackReward(userId, orderId, orderNumber, orderAmountPaise, shopId = null) {
  const queue = getQueue();
  if (!queue) {
    // Sync fallback — awardCashback never throws
    const { awardCashback } = await import('../services/cashback.service.js');
    awardCashback(userId, orderId, orderNumber, orderAmountPaise, shopId).catch(e =>
      logger.warn('cashback award (sync fallback) failed', { error: e.message })
    );
    return null;
  }
  try {
    return await queue.send(
      QUEUES.PROCESS_CASHBACK,
      { userId, orderId, orderNumber, orderAmountPaise, shopId },
      { ...DEFAULT_JOB_OPTIONS, retryLimit: 5 },
    );
  } catch (err) {
    logger.error('Failed to enqueue cashback reward', { userId, orderId, error: err.message });
    return null;
  }
}

/**
 * P4-4B: Manually enqueue a settlement generation run.
 * The cron fires this weekly; admin can also trigger on-demand
 * via POST /admin/settlements/generate → settlement.controller.js
 * (which calls generateWeeklySettlements() directly, not via queue).
 * This helper exists for any future programmatic queueing needs.
 */
export async function enqueueSettlementRun(periodEnd, periodStart) {
  const queue = getQueue();
  if (!queue) return null;
  try {
    return await queue.send(
      QUEUES.WEEKLY_SETTLEMENTS,
      { periodEnd: periodEnd?.toISOString(), periodStart: periodStart?.toISOString() },
      { ...DEFAULT_JOB_OPTIONS, retryLimit: 2 },
    );
  } catch (err) {
    logger.error('Failed to enqueue settlement run', { error: err.message });
    return null;
  }
}

/**
 * P5-5A: Enqueue a low-stock alert for a single inventory item.
 * Fire-and-forget — called after order placement, never throws.
 *
 * @param {{ shopId, inventoryId, productName, currentStock, threshold }} payload
 */
export async function enqueueLowStockAlert(payload) {
  const queue = getQueue();
  if (!queue) {
    // Sync fallback — log only, alert isn't critical enough to block
    logger.warn('low-stock-alert: queue unavailable (sync fallback — no alert sent)', payload);
    return null;
  }
  try {
    return await queue.send(
      QUEUES.LOW_STOCK_ALERT,
      payload,
      { ...DEFAULT_JOB_OPTIONS, retryLimit: 3 },
    );
  } catch (err) {
    logger.error('Failed to enqueue low-stock alert', { ...payload, error: err.message });
    return null;
  }
}

// ── Worker Registration ───────────────────────────────────────

async function _registerWorkers() {
  // Lazy-import services to avoid circular dependencies at startup
  const { sendNotificationDirect } = await import('../services/notification.service.js');
  const { send: sendSms }          = await import('../services/sms.service.js');

  // Worker 1: Notification delivery (in-app + push)
  await boss.work(
    QUEUES.SEND_NOTIFICATION,
    {
      teamSize:        5,   // process up to 5 jobs in parallel
      teamConcurrency: 5,
    },
    async (job) => {
      const { userId, type, title, body, data } = job.data;
      try {
        await sendNotificationDirect(userId, type, title, body, data);
        logger.debug('Notification job complete', { jobId: job.id, userId, type });
      } catch (err) {
        logger.error('Notification job failed', { jobId: job.id, userId, type, error: err.message });
        throw err; // re-throw → pg-boss will retry
      }
    },
  );

  // Worker 2: SMS delivery
  await boss.work(
    QUEUES.SEND_SMS,
    { teamSize: 3, teamConcurrency: 3 },
    async (job) => {
      const { phone, message } = job.data;
      try {
        await sendSms(phone, message);
        logger.debug('SMS job complete', { jobId: job.id, phone: phone?.slice(-4) });
      } catch (err) {
        logger.error('SMS job failed', { jobId: job.id, error: err.message });
        throw err;
      }
    },
  );

  // Worker 3: Ratings materialized view refresh
  await boss.work(
    QUEUES.REFRESH_RATINGS,
    { teamSize: 1, teamConcurrency: 1 }, // serialized — view refresh is non-concurrent
    async (job) => {
      try {
        const { error } = await supabaseAdmin.rpc('refresh_shop_ratings');
        if (error) throw new Error(error.message);
        logger.info('Ratings refresh job complete', { jobId: job.id });
      } catch (err) {
        logger.error('Ratings refresh job failed', { jobId: job.id, error: err.message });
        throw err;
      }
    },
  );

  // Cron 4: Expire stale wallet credits — daily at midnight IST (18:30 UTC) — P4-1C
  // Calls the expire_wallet_credits() Postgres function (Migration 028).
  // pg-boss ensures this only fires once per day even with multiple server replicas.
  await boss.schedule(
    QUEUES.EXPIRE_WALLET_CREDITS,
    '30 18 * * *',   // 18:30 UTC = 00:00 IST next day
    {},              // no job payload needed
    { tz: 'UTC' },
  );

  await boss.work(
    QUEUES.EXPIRE_WALLET_CREDITS,
    { teamSize: 1, teamConcurrency: 1 },
    async (job) => {
      try {
        const { data: expiredCount, error } = await supabaseAdmin
          .rpc('expire_wallet_credits');
        if (error) {
          logger.error('Wallet credit expiry failed', { jobId: job.id, error: error.message });
          throw new Error(error.message);
        }
        logger.info('Wallet credits expired', { jobId: job.id, expiredCount });
      } catch (err) {
        logger.error('Wallet credit expiry job failed', { jobId: job.id, error: err.message });
        throw err; // re-throw → pg-boss will retry (max 3 per DEFAULT_JOB_OPTIONS)
      }
    },
  );

  // Worker 5: Referral reward (P4-2A) — fired after order placement
  // processReferralReward() is idempotent — safe to retry on failure.
  await boss.work(
    QUEUES.PROCESS_REFERRAL,
    { teamSize: 3, teamConcurrency: 3 },
    async (job) => {
      const { userId, orderId } = job.data;
      try {
        const { processReferralReward } = await import('../services/referral.service.js');
        await processReferralReward(userId, orderId);
        logger.debug('Referral reward job complete', { jobId: job.id, userId, orderId });
      } catch (err) {
        logger.error('Referral reward job failed', { jobId: job.id, userId, orderId, error: err.message });
        throw err; // re-throw → pg-boss retries up to 5×
      }
    },
  );

  // Worker 6: Cashback reward (P4-2B) — fired after delivery confirmation
  // awardCashback() is idempotent: checks wallet_transactions before crediting.
  await boss.work(
    QUEUES.PROCESS_CASHBACK,
    { teamSize: 5, teamConcurrency: 5 }, // higher concurrency — many deliveries at once
    async (job) => {
      const { userId, orderId, orderNumber, orderAmountPaise, shopId } = job.data;
      try {
        const { awardCashback } = await import('../services/cashback.service.js');
        const result = await awardCashback(userId, orderId, orderNumber, orderAmountPaise, shopId);
        logger.debug('Cashback job complete', { jobId: job.id, userId, orderId, paise: result.paise });
      } catch (err) {
        // awardCashback() never throws — this only fires on catastrophic failures
        logger.error('Cashback job failed', { jobId: job.id, userId, orderId, error: err.message });
        throw err;
      }
    },
  );

  // Cron 7 + Worker 7: Weekly settlements (P4-4B)
  // Monday 09:00 IST = 03:30 UTC (IST = UTC+5:30)
  // pg-boss ensures this fires exactly once even with multiple replicas.
  // generateWeeklySettlements() is idempotent — safe to retry on failure.
  await boss.schedule(
    QUEUES.WEEKLY_SETTLEMENTS,
    '30 3 * * 1',  // 03:30 UTC every Monday = 09:00 IST
    {},
    { tz: 'UTC' },
  );

  await boss.work(
    QUEUES.WEEKLY_SETTLEMENTS,
    { teamSize: 1, teamConcurrency: 1 }, // serialized — one run at a time
    async (job) => {
      const { periodEnd, periodStart } = job.data || {};
      try {
        const { generateWeeklySettlements } = await import('../services/settlement.service.js');
        const result = await generateWeeklySettlements(
          periodEnd   ? new Date(periodEnd)   : undefined,
          periodStart ? new Date(periodStart) : undefined,
        );
        logger.info('Weekly settlement job complete', {
          jobId: job.id,
          created:  result.created,
          skipped:  result.skipped,
          errors:   result.errors,
        });
      } catch (err) {
        logger.error('Weekly settlement job failed', { jobId: job.id, error: err.message });
        throw err; // re-throw → pg-boss retries (max 2 per DEFAULT_JOB_OPTIONS override)
      }
    },
  );

  // Cron 8 + Worker 8: Expire stale referral events (P5-0D Bug 2)
  // Referral events where the referred user never placed an order within 90 days
  // are marked 'expired'. This prevents stale pipeline data and ensures
  // the referral stats (pending_count) stay accurate.
  // Daily at 01:00 IST = 19:30 UTC (runs after midnight wallet expiry at 00:00 IST)
  await boss.schedule(
    QUEUES.EXPIRE_REFERRAL_EVENTS,
    '30 19 * * *',   // 19:30 UTC = 01:00 IST
    {},
    { tz: 'UTC' },
  );

  await boss.work(
    QUEUES.EXPIRE_REFERRAL_EVENTS,
    { teamSize: 1, teamConcurrency: 1 },
    async (job) => {
      try {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const { data: expired, error } = await supabaseAdmin
          .from('referral_events')
          .update({ status: 'expired' })
          .eq('status', 'pending')
          .lt('created_at', cutoff)
          .select('id');

        if (error) throw new Error(error.message);

        const count = expired?.length || 0;
        logger.info('Referral expiry job complete', { jobId: job.id, expiredCount: count });
      } catch (err) {
        logger.error('Referral expiry job failed', { jobId: job.id, error: err.message });
        throw err; // re-throw → pg-boss retries
      }
    },
  );

  // Cron 9 + Worker 9: Prune old rider location pings (P5-1)
  // rider_locations is an INSERT-only append log (every 5s per active rider).
  // Without pruning it grows ~17K rows/hour per active rider.
  // We keep 7 days for dispute resolution; prune nightly at 03:00 IST = 21:30 UTC.
  await boss.schedule(
    QUEUES.PRUNE_RIDER_LOCATIONS,
    '30 21 * * *',   // 21:30 UTC = 03:00 IST
    {},
    { tz: 'UTC' },
  );

  await boss.work(
    QUEUES.PRUNE_RIDER_LOCATIONS,
    { teamSize: 1, teamConcurrency: 1 },
    async (job) => {
      try {
        // Calls the SQL function created in migration 038
        const { data, error } = await supabaseAdmin.rpc('prune_old_rider_locations');
        if (error) throw new Error(error.message);
        const deletedCount = data ?? 0;
        logger.info('Rider locations pruned', { jobId: job.id, deletedCount });
      } catch (err) {
        logger.error('Rider location prune job failed', { jobId: job.id, error: err.message });
        throw err; // re-throw → pg-boss retries
      }
    },
  );


  // Cron 10 + Worker 10: Expire TezzPass subscriptions (P5-3)
  // Marks 'active' subscriptions whose expires_at < now() as 'expired'.
  // Runs daily at 00:00 IST = 18:30 UTC (30 min before midnight to catch timezone drift).
  await boss.schedule(
    QUEUES.EXPIRE_SUBSCRIPTIONS,
    '30 18 * * *',   // 18:30 UTC = 00:00 IST
    {},
    { tz: 'UTC' },
  );

  await boss.work(
    QUEUES.EXPIRE_SUBSCRIPTIONS,
    { teamSize: 1, teamConcurrency: 1 },
    async (job) => {
      try {
        const { expireSubscriptions } = await import('../services/subscription.service.js');
        const result = await expireSubscriptions();
        logger.info('TezzPass expiry job complete', { jobId: job.id, expired: result?.expired ?? 0 });
      } catch (err) {
        logger.error('TezzPass expiry job failed', { jobId: job.id, error: err.message });
        throw err; // re-throw → pg-boss retries
      }
    },
  );
  // Cron 11 + Worker 11: Dead-Letter Queue Alerting (P5-4B)
  // Checks for failed jobs that have exhausted all retries.
  // Runs daily at 09:00 IST = 03:30 UTC — after overnight jobs complete.
  // Sends SMS to FOUNDER_PHONE if any failed jobs detected in last 24h.
  await boss.schedule(
    QUEUES.CHECK_FAILED_JOBS,
    '30 3 * * *',   // 03:30 UTC = 09:00 IST
    {},
    { tz: 'UTC' },
  );

  await boss.work(
    QUEUES.CHECK_FAILED_JOBS,
    { teamSize: 1, teamConcurrency: 1 },
    async (job) => {
      try {
        // Query pgboss schema directly for jobs that failed in the last 24h.
        // pg-boss stores failed jobs in pgboss.job with state='failed'.
        // Supabase's PostgREST can query non-public schemas using the schema name.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: failedJobs, error } = await supabaseAdmin
          .schema('pgboss')
          .from('job')
          .select('name, output, completedon')
          .eq('state', 'failed')
          .gte('completedon', since)
          .order('completedon', { ascending: false })
          .limit(50);

        if (error) {
          // pgboss schema not accessible via REST (common in Supabase) — log only
          logger.warn('DLQ check: could not query pgboss.job via REST', { error: error.message });
          return;
        }

        const count = failedJobs?.length || 0;

        if (count === 0) {
          logger.info('DLQ check: no failed jobs in last 24h', { jobId: job.id });
          return;
        }

        // Log full details for the on-call engineer
        logger.error(`DLQ alert: ${count} failed job(s) in last 24h`, {
          jobId: job.id,
          failedJobs: failedJobs.map(j => ({
            name:        j.name,
            error:       j.output?.message || JSON.stringify(j.output),
            completedOn: j.completedon,
          })),
        });

        // SMS the founder if FOUNDER_PHONE is configured
        const founderPhone = process.env.FOUNDER_PHONE;
        if (founderPhone) {
          const { send } = await import('../services/sms.service.js');
          await send(
            founderPhone,
            `⚠️ TezzNirmaan: ${count} failed background job(s) in last 24h. Check server logs immediately.`
          );
        }
      } catch (err) {
        // Non-fatal — monitoring failure must never crash the queue itself
        logger.error('DLQ check job failed', { jobId: job.id, error: err.message });
      }
    },
  );


  // Worker 12: Low Stock Alert (P5-5A)
  // Fired after each order placement for every item whose stock dropped to or
  // below its threshold. Notifies the shop owner in-app (+ push, no SMS).
  // Concurrency 5 — a busy shop could have many simultaneous stock checks.
  await boss.work(
    QUEUES.LOW_STOCK_ALERT,
    { teamSize: 5, teamConcurrency: 5 },
    async (job) => {
      const { shopId, productName, currentStock, threshold, inventoryId } = job.data;
      try {
        // Get shop owner profile_id
        const { data: shop, error } = await supabaseAdmin
          .from('shops')
          .select('profile_id, name')
          .eq('id', shopId)
          .single();

        if (error || !shop?.profile_id) {
          logger.warn('low-stock-alert: shop not found', { shopId });
          return;
        }

        const isOut   = Number(currentStock) === 0;
        const emoji   = isOut ? '🚨' : '⚠️';
        const urgency = isOut ? 'OUT OF STOCK' : 'Low stock';
        const body    = isOut
          ? `${productName} is now OUT OF STOCK. Restock immediately to keep taking orders.`
          : `${productName} has only ${currentStock} left (threshold: ${threshold}). Restock soon.`;

        // sendNotificationDirect is already imported at top of _registerWorkers
        // sendSms: false — low-stock is an operational alert, not a critical customer-facing event
        await sendNotificationDirect(
          shop.profile_id,
          'low_stock',
          `${emoji} ${urgency}: ${productName}`,
          body,
          { sendSms: false, metadata: { shop_id: shopId, inventory_id: inventoryId, current_stock: currentStock, threshold } }
        );

        logger.info('low-stock-alert: notified', {
          shopId, productName, currentStock, threshold, isOut,
        });
      } catch (err) {
        logger.error('low-stock-alert worker failed', { jobId: job.id, shopId, error: err.message });
        throw err; // re-throw → pg-boss retries (max 3)
      }
    },
  );

  logger.info('P1-E: All job workers registered', {
    workers: Object.values(QUEUES),
  });
}

// ── Graceful Shutdown ─────────────────────────────────────────

/**
 * Stop pg-boss gracefully.
 * Call from server.js SIGTERM/SIGINT handlers — before process.exit().
 */
export async function stopQueue() {
  if (boss && queueEnabled) {
    try {
      await boss.stop({ graceful: true, timeout: 10000 });
      logger.info('P1-E: Job queue stopped gracefully');
    } catch (err) {
      logger.warn('P1-E: Job queue stop error (non-fatal)', { error: err.message });
    } finally {
      boss = null;
      queueEnabled = false;
    }
  }
}

// ── Stats (for monitoring endpoint) ──────────────────────────

/**
 * Get job queue stats by queue name.
 * Returns { queued, active, failed, completed } per queue + totals.
 */
export async function getQueueStats() {
  if (!boss || !queueEnabled) {
    return { enabled: false, queues: {} };
  }

  try {
    const queues = Object.values(QUEUES);
    const stats  = {};

    await Promise.all(queues.map(async (name) => {
      try {
        const [queued, active, failed, completed] = await Promise.all([
          boss.getQueueSize(name, { before: 'active' }),
          boss.getQueueSize(name, { before: 'completed' })
            .then(total => total - (stats[name]?.queued || 0)),
          boss.getJobById(name, 'failed').then(() => 0).catch(() => 0), // approximate
          boss.getJobById(name, 'completed').then(() => 0).catch(() => 0),
        ]);
        stats[name] = { queued: queued || 0, active: 0, failed: 0, completed: 0 };
      } catch {
        stats[name] = { queued: 0, active: 0, failed: 0, completed: 0 };
      }
    }));

    // Use pg-boss's built-in counts where available
    const counts = await boss.countStates().catch(() => ({}));

    return {
      enabled: true,
      counts,  // { created, retry, active, expired, cancelled, completed, failed }
      queues: stats,
    };
  } catch (err) {
    logger.error('getQueueStats error', { error: err.message });
    return { enabled: true, error: err.message };
  }
}
