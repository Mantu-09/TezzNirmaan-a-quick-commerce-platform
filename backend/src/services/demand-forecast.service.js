// backend/src/services/demand-forecast.service.js — P17-2
// Demand forecasting for shop owners.
// Simple moving average + day-of-week seasonality + Bihar monsoon factor.
// No external ML service needed — pure Node.js math.

import { supabaseAdmin } from '../config/supabase.js';

const DOW_MULTIPLIER = [0.6, 1.0, 1.05, 1.0, 1.05, 1.1, 0.9]; // Sun-Sat
const MONSOON_MONTHS  = [6, 7, 8, 9]; // June-September in Bihar

// Category seasonal boosts during monsoon
const MONSOON_BOOST = {
  paints:       2.0,  // Waterproofing demand spikes
  construction: 1.3,  // Repairs after rain damage
  plumbing:     1.5,  // Water leakage fixes
  electrical:   1.1,
  hardware:     1.0,
  tiles:        0.8,  // Less outdoor work during monsoon
};

/**
 * forecastDemand(shopId, days=7)
 * Returns array of { product_id, product_name, category, current_stock,
 *   predicted_units, confidence, trend, restock_suggestion }
 */
export async function forecastDemand(shopId, days = 7) {
  try {
    // 1. Get all active inventory for this shop
    const { data: inventory } = await supabaseAdmin
      .from('shop_inventory')
      .select('id, stock_qty, product:products(id, name, category, brand)')
      .eq('shop_id', shopId)
      .gt('stock_qty', 0)
      .limit(100);

    if (!inventory || !inventory.length) return [];

    const inventoryIds = inventory.map(i => i.id);
    const invMap       = Object.fromEntries(inventory.map(i => [i.id, i]));

    // 2. Get 90 days of order_items for this shop's inventory
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('inventory_id, quantity, created_at')
      .in('inventory_id', inventoryIds)
      .gte('created_at', ninetyDaysAgo)
      .order('created_at');

    if (!orderItems || !orderItems.length) {
      // No history — return conservative estimates
      return inventory.slice(0, 20).map(inv => ({
        inventory_id:       inv.id,
        product_id:         inv.product?.id,
        product_name:       inv.product?.name || 'Unknown',
        category:           inv.product?.category || 'hardware',
        current_stock:      inv.stock_qty,
        predicted_units:    2,
        confidence:         'low',
        trend:              'stable',
        restock_suggestion: null,
        traffic_light:      'green',
      }));
    }

    // 3. Aggregate daily sales per inventory item
    const salesByInv = {};
    orderItems.forEach(item => {
      const invId = item.inventory_id;
      if (!salesByInv[invId]) salesByInv[invId] = {};
      const day = item.created_at.slice(0, 10);
      salesByInv[invId][day] = (salesByInv[invId][day] || 0) + (item.quantity || 1);
    });

    const now          = new Date();
    const isMonsoon    = MONSOON_MONTHS.includes(now.getMonth() + 1);
    const forecastDate = new Date(Date.now() + days * 24 * 3600 * 1000);

    const results = [];

    for (const inv of inventory) {
      const daily = salesByInv[inv.id] || {};
      const dayKeys = Object.keys(daily).sort();
      if (!dayKeys.length) continue;

      const totalSold  = Object.values(daily).reduce((a, b) => a + b, 0);
      const activeDays = dayKeys.length;
      const avgPerDay  = totalSold / 90; // use 90-day window

      // 7-day moving average (most recent)
      const recent7 = dayKeys.slice(-7);
      const avg7    = recent7.reduce((s, d) => s + (daily[d] || 0), 0) / Math.max(recent7.length, 1);

      // 28-day moving average
      const recent28 = dayKeys.slice(-28);
      const avg28    = recent28.reduce((s, d) => s + (daily[d] || 0), 0) / Math.max(recent28.length, 1);

      // Trend: comparing recent 7d vs prior 7d
      const prior7  = dayKeys.slice(-14, -7);
      const avgPrior = prior7.reduce((s, d) => s + (daily[d] || 0), 0) / Math.max(prior7.length, 1);
      const trendPct = avgPrior > 0 ? ((avg7 - avgPrior) / avgPrior) * 100 : 0;
      const trend    = trendPct > 10 ? 'rising' : trendPct < -10 ? 'falling' : 'stable';

      // Day-of-week weighted average for forecast period
      let dowWeightedSum = 0;
      let dowDays = 0;
      for (let d = 0; d < days; d++) {
        const forecastDay = new Date(Date.now() + d * 24 * 3600 * 1000);
        const dow = forecastDay.getDay(); // 0=Sun
        dowWeightedSum += DOW_MULTIPLIER[dow];
        dowDays++;
      }
      const dowFactor = dowWeightedSum / dowDays;

      // Monsoon factor
      const cat          = inv.product?.category?.toLowerCase() || 'hardware';
      const monsoonFactor = isMonsoon ? (MONSOON_BOOST[cat] || 1.0) : 1.0;

      // Blend 7d avg (70%) and 28d avg (30%)
      const blendedAvg    = avg7 * 0.7 + avg28 * 0.3;
      const predictedUnits = Math.ceil(blendedAvg * days * dowFactor * monsoonFactor);

      // Confidence: based on data volume
      const confidence = activeDays >= 20 ? 'high' : activeDays >= 7 ? 'medium' : 'low';

      // Restock suggestion
      const daysOfStock   = predictedUnits > 0 ? Math.round(inv.stock_qty / (blendedAvg || 0.1)) : 999;
      const trafficLight  = daysOfStock < days ? 'red' : daysOfStock < days * 2 ? 'yellow' : 'green';
      const restock       = trafficLight === 'red'
        ? `Restock now — only ${inv.stock_qty} left, need ~${predictedUnits} in ${days} days`
        : trafficLight === 'yellow'
        ? `Consider restocking — ~${Math.ceil(predictedUnits * 1.5)} units recommended`
        : null;

      results.push({
        inventory_id:       inv.id,
        product_id:         inv.product?.id,
        product_name:       inv.product?.name || 'Unknown',
        category:           cat,
        current_stock:      inv.stock_qty,
        predicted_units:    predictedUnits,
        avg_daily:          Math.round(blendedAvg * 10) / 10,
        trend,
        trend_pct:          Math.round(trendPct),
        confidence,
        days_of_stock:      daysOfStock,
        restock_suggestion: restock,
        traffic_light:      trafficLight,
        monsoon_applied:    isMonsoon && monsoonFactor !== 1.0,
      });
    }

    // Sort: red first, then yellow, then green; within each, by predicted_units desc
    const priority = { red: 0, yellow: 1, green: 2 };
    return results.sort((a, b) =>
      priority[a.traffic_light] - priority[b.traffic_light] ||
      b.predicted_units - a.predicted_units
    );
  } catch (err) {
    console.error('[DemandForecast] error:', err.message);
    return [];
  }
}
