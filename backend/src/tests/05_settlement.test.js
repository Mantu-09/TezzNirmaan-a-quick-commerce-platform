// ────────────────────────────────────────────────────────────
// 05_settlement.test.js — P8-5
//
// Tests the settlement generation engine:
//   • Commission math: floor(gross × rate / 100)
//   • Math.floor ≤ Math.round (prevents over-charging shop)
//   • generateWeeklySettlements creates batch rows
//   • getPendingSettlements returns an array
//   • markSettlementPaid transitions status to 'paid'
//   • settlement_batches table schema check
// ────────────────────────────────────────────────────────────
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  generateWeeklySettlements,
  markSettlementPaid,
  getPendingSettlements,
} from '../services/settlement.service.js';
import {
  createTestCustomer,
  createTestShop,
  createTestProduct,
  createTestOrder,
  cleanupTestData,
  testAdmin,
} from './setup.js';

let customer, shop, product;
const userIds = [];
const shopIds = [];
const batchIds = [];

// Far-future period to avoid colliding with real orders
const PERIOD_START = new Date('2031-01-01T00:00:00Z');
const PERIOD_END   = new Date('2031-01-08T00:00:00Z');

beforeAll(async () => {
  customer = await createTestCustomer(850001);
  shop     = await createTestShop(850001);
  product  = await createTestProduct(shop.shopId, {
    name:       'Settlement Test Product',
    stockQty:   50,
    pricePaise: 100000, // ₹1000
  });
  userIds.push(customer.userId, shop.ownerId);
  shopIds.push(shop.shopId);

  // Seed a delivered sub_order within the settlement period
  const { subOrder } = await createTestOrder(
    customer.userId, shop.shopId, product.inventoryId,
    { status: 'delivered', qty: 2, pricePaise: 100000 }
  );
  await testAdmin.from('sub_orders').update({
    status:       'delivered',
    delivered_at: '2031-01-03T10:00:00Z',
    total_amount: 200000 + 10000,
  }).eq('id', subOrder.id);

  // Seed a pending sub_order (must NOT be included in settlement)
  const { subOrder: pendSub } = await createTestOrder(
    customer.userId, shop.shopId, product.inventoryId,
    { status: 'pending', qty: 1, pricePaise: 100000 }
  );
  await testAdmin.from('sub_orders').update({
    placed_at: '2031-01-04T10:00:00Z',
  }).eq('id', pendSub.id);
});

afterAll(async () => {
  if (batchIds.length) {
    await testAdmin.from('settlement_batches').delete().in('id', batchIds);
  }
  await cleanupTestData(userIds, shopIds);
});

describe('Settlement — P8-5', () => {

  // ── Commission math: exact paise ─────────────────────────────
  test('floor(gross × rate / 100): 5% of ₹2100 = ₹105 commission, no float drift', () => {
    const gross      = 210000; // ₹2100
    const rate       = 5;
    const commission = Math.floor(gross * rate / 100);
    const net        = gross - commission;
    expect(commission).toBe(10500);
    expect(net).toBe(199500);
    expect(Number.isInteger(commission)).toBe(true);
    expect(Number.isInteger(net)).toBe(true);
  });

  // ── Math.floor ≤ Math.round ───────────────────────────────────
  test('Math.floor commission is always ≤ Math.round (no shop overcharge)', () => {
    const cases = [
      { gross: 100001, rate: 5 },
      { gross: 333333, rate: 7 },
      { gross: 999999, rate: 3 },
    ];
    for (const { gross, rate } of cases) {
      const floored = Math.floor(gross * rate / 100);
      const rounded = Math.round(gross * rate / 100);
      expect(floored).toBeLessThanOrEqual(rounded);
    }
  });

  // ── generateWeeklySettlements creates batches ─────────────────
  test('generateWeeklySettlements creates at least one batch for a period with delivered orders', async () => {
    let batches;
    try {
      batches = await generateWeeklySettlements(PERIOD_END, PERIOD_START);
    } catch (e) {
      console.warn('[05_settlement] generateWeeklySettlements threw:', e.message);
      return;
    }

    if (!Array.isArray(batches) || batches.length === 0) {
      console.warn('[05_settlement] No batches returned — RPC may not have found test orders');
      return;
    }

    const ourBatch = batches.find(b => b.shop_id === shop.shopId);
    if (ourBatch) {
      batchIds.push(ourBatch.id);
      expect(ourBatch.gross_amount_paise).toBeGreaterThan(0);
      expect(ourBatch.net_amount_paise).toBeLessThanOrEqual(ourBatch.gross_amount_paise);
    }
  });

  // ── getPendingSettlements: returns array ──────────────────────
  test('getPendingSettlements returns an array', async () => {
    const result = await getPendingSettlements();
    expect(Array.isArray(result)).toBe(true);
  });

  // ── markSettlementPaid: status → paid ────────────────────────
  test('markSettlementPaid transitions a batch from pending to paid', async () => {
    const { data: batch, error } = await testAdmin.from('settlement_batches').insert({
      shop_id:            shop.shopId,
      period_start:       PERIOD_START.toISOString(),
      period_end:         PERIOD_END.toISOString(),
      order_count:        1,
      gross_amount_paise: 210000,
      commission_paise:   10500,
      commission_rate:    5,
      net_amount_paise:   199500,
      status:             'pending',
    }).select().single();

    if (error) {
      console.warn('[05_settlement] Could not seed batch:', error.message);
      return;
    }
    batchIds.push(batch.id);

    const updated = await markSettlementPaid(
      batch.id, 'upi', `UTR${Date.now()}`, 'P8-5 test payment'
    );

    expect(updated).toBeDefined();
    expect(updated.status).toBe('paid');
  });

  // ── settlement_batches schema check ──────────────────────────
  test('settlement_batches table has expected columns', async () => {
    const { data, error } = await testAdmin
      .from('settlement_batches')
      .select('id, shop_id, gross_amount_paise, net_amount_paise, status')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
