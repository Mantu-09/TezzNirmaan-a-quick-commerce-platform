// backend/src/services/low-stock-alert.service.js — P15-8
// Cron: scan inventory below threshold, send WhatsApp + push to shop owner.

import { supabaseAdmin } from '../config/supabase.js';
import * as wa from './whatsapp.service.js';

export async function runLowStockAlerts() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();

    // Find inventory items below threshold, not alerted in last 24h
    const { data: lowItems, error } = await supabaseAdmin
      .from('low_stock_thresholds')
      .select(`
        id, threshold_qty, alert_sent_at,
        inventory:shop_inventory(
          id, stock_qty,
          product:products(name),
          shop:shops(id, name, owner_id, owner:profiles(phone, name))
        )
      `)
      .or(`alert_sent_at.is.null,alert_sent_at.lt.${oneDayAgo}`);

    if (error) throw error;

    let alerted = 0;
    for (const row of (lowItems || [])) {
      const inv = row.inventory;
      if (!inv || inv.stock_qty > row.threshold_qty) continue; // Above threshold

      const shop  = inv.shop;
      const owner = shop?.owner;
      if (!owner?.phone) continue;

      const msg = `⚠️ Low Stock Alert!\n${inv.product?.name || 'Product'} in ${shop?.name || 'your shop'} is running low: only ${inv.stock_qty} units left (threshold: ${row.threshold_qty}).\n\nPlease restock soon → tezznirmaan.in/dashboard/inventory`;

      wa.sendMessage(owner.phone, msg).catch(e => console.warn('[LowStock] WA failed:', e.message));

      // Update alert_sent_at
      await supabaseAdmin.from('low_stock_thresholds').update({ alert_sent_at: new Date().toISOString() }).eq('id', row.id);
      alerted++;
    }

    console.log(`[LowStockAlert] Sent ${alerted} alerts`);
    return alerted;
  } catch (err) {
    console.error('[LowStockAlert] Error:', err.message);
    return 0;
  }
}
