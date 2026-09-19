// backend/src/services/reorder-nudge.service.js — P14-8
// Daily cron: find customers who ordered N days ago and send reorder nudges.
// Call scheduleDailyNudges() from a cron job or via admin trigger.

import { supabaseAdmin } from '../config/supabase.js';
import * as wa from './whatsapp.service.js';

export async function scheduleDailyNudges() {
  try {
    // Load active nudge rules
    const { data: rules, error } = await supabaseAdmin
      .from('reorder_nudge_rules').select('*').eq('is_active', true);
    if (error || !rules?.length) return;

    for (const rule of rules) {
      const targetDate = new Date(Date.now() - rule.days_after_order * 86400000);
      const dayStart   = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd     = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

      // Find orders placed on that day in matching category
      let query = supabaseAdmin
        .from('orders')
        .select('customer_id, profile:profiles(name, phone)')
        .eq('status', 'delivered')
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString());

      if (rule.category) {
        // Filter by category via sub_orders → order_items → products
        // Simplified: use order with items matching category
        query = query.contains('category_tags', [rule.category]);
      }

      const { data: orders } = await query.limit(500).catch(() => ({ data: [] }));

      for (const order of (orders || [])) {
        const phone = order.profile?.phone;
        const name  = order.profile?.name || 'Customer';
        if (!phone) continue;

        // Send WhatsApp nudge (fire-and-forget)
        wa.sendTemplateMessage(phone, rule.message_template, [name])
          .catch(e => console.warn('[NudgeSvc] WA failed', phone, e.message));
      }

      console.log(`[NudgeSvc] Rule "${rule.category || 'all'}" (${rule.days_after_order}d): nudged ${orders?.length || 0} customers`);
    }
  } catch (err) {
    console.error('[NudgeSvc] Error:', err.message);
  }
}
