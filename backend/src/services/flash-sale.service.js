// backend/src/services/flash-sale.service.js — P18-4
// Flash sale auto-scheduler.
// Runs every 5 minutes via setInterval (started from server.js).
// Auto-activates sales where scheduled_start <= NOW.
// Auto-deactivates sales where scheduled_end <= NOW.
// Sends admin push notification on auto-start/stop.

import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

let schedulerTimer = null;

/**
 * startFlashSaleScheduler()
 * Call once at server startup.
 * Polls every 5 minutes to activate/deactivate scheduled flash sales.
 */
export function startFlashSaleScheduler() {
  if (schedulerTimer) return; // Already running
  logger.info('[FlashSale] Auto-scheduler started — checking every 5 minutes');

  // Run immediately on startup, then every 5 min
  runSchedulerTick();
  schedulerTimer = setInterval(runSchedulerTick, 5 * 60 * 1000);
}

export function stopFlashSaleScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('[FlashSale] Auto-scheduler stopped');
  }
}

async function runSchedulerTick() {
  try {
    const now = new Date().toISOString();

    // 1. Auto-ACTIVATE: scheduled_start <= NOW and currently inactive and auto_managed
    const { data: toActivate } = await supabaseAdmin
      .from('flash_sales')
      .select('id, title, shop_id, scheduled_start, scheduled_end')
      .eq('is_active', false)
      .eq('auto_managed', true)
      .lte('scheduled_start', now)
      .not('scheduled_start', 'is', null);

    for (const sale of (toActivate || [])) {
      // C4: Also update starts_at/ends_at — the public /flash-sales route filters by these columns
      await supabaseAdmin
        .from('flash_sales')
        .update({
          is_active:  true,
          starts_at:  sale.scheduled_start,
          ends_at:    sale.scheduled_end,
        })
        .eq('id', sale.id);

      logger.info(`[FlashSale] Auto-activated: "${sale.title}" (${sale.id})`);
      await notifyAdmins(`🚀 Flash sale started: "${sale.title}"`, sale.shop_id);
    }

    // 2. Auto-DEACTIVATE: scheduled_end <= NOW and currently active and auto_managed
    const { data: toDeactivate } = await supabaseAdmin
      .from('flash_sales')
      .select('id, title, shop_id')
      .eq('is_active', true)
      .eq('auto_managed', true)
      .lte('scheduled_end', now)
      .not('scheduled_end', 'is', null);

    for (const sale of (toDeactivate || [])) {
      await supabaseAdmin
        .from('flash_sales')
        .update({ is_active: false })
        .eq('id', sale.id);

      logger.info(`[FlashSale] Auto-deactivated: "${sale.title}" (${sale.id})`);
      await notifyAdmins(`⏹️ Flash sale ended: "${sale.title}"`, sale.shop_id);
    }

    if ((toActivate?.length || 0) + (toDeactivate?.length || 0) > 0) {
      logger.info(`[FlashSale] Tick complete — activated: ${toActivate?.length || 0}, deactivated: ${toDeactivate?.length || 0}`);
    }
  } catch (err) {
    logger.error('[FlashSale] Scheduler tick error:', { error: err.message });
  }
}

async function notifyAdmins(message, shopId) {
  try {
    // Get all admin profile IDs to push notification
    const { data: admins } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(10);

    if (!admins?.length) return;

    // Insert into notifications table (if it exists)
    const notifications = admins.map(a => ({
      profile_id: a.id,
      title:      'Flash Sale Update',
      body:       message,
      type:       'flash_sale',
      data:       { shop_id: shopId },
    }));

    await supabaseAdmin.from('notifications').insert(notifications).catch(() => {});
  } catch {
    // Non-fatal
  }
}
