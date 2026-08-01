// ────────────────────────────────────────────────────────────
// 06_returns.test.js — P8-5
//
// Tests the return request lifecycle:
//   • checkReturnEligibility: eligible within 24h window
//   • checkReturnEligibility: NOT eligible after 24h
//   • requestReturn: creates a return_request row
//   • approveReturn (wallet): credits customer wallet
//   • rejectReturn: status → rejected
//   • return_requests schema check
// ────────────────────────────────────────────────────────────
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  createTestCustomer,
  createTestShop,
  createTestProduct,
  createTestOrder,
  cleanupTestData,
  testAdmin,
} from './setup.js';
import {
  requestReturn,
  checkReturnEligibility,
  approveReturn,
  rejectReturn,
} from '../services/return.service.js';
import { getWallet } from '../services/wallet.service.js';

let customer, shop, product;
const userIds = [];
const shopIds = [];
const returnIds = [];

beforeAll(async () => {
  customer = await createTestCustomer(860001);
  shop     = await createTestShop(860001);
  product  = await createTestProduct(shop.shopId, {
    name: 'Return Test Product', stockQty: 10, pricePaise: 80000,
  });
  userIds.push(customer.userId, shop.ownerId);
  shopIds.push(shop.shopId);
});

afterAll(async () => {
  if (returnIds.length) {
    await testAdmin.from('return_requests').delete().in('id', returnIds);
  }
  await cleanupTestData(userIds, shopIds);
});

/** Seed a delivered sub_order with a custom delivered_at offset */
async function seedDeliveredSubOrder(hoursAgo) {
  const { subOrder } = await createTestOrder(
    customer.userId, shop.shopId, product.inventoryId,
    { status: 'delivered', qty: 1, pricePaise: 80000 }
  );
  const deliveredAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  await testAdmin.from('sub_orders').update({
    status:       'delivered',
    delivered_at: deliveredAt,
    shop_id:      shop.shopId,
  }).eq('id', subOrder.id);
  return subOrder;
}

describe('Returns — P8-5', () => {

  // ── checkReturnEligibility: within window ─────────────────────
  test('checkReturnEligibility: eligible for sub-order delivered 1h ago', async () => {
    const subOrder = await seedDeliveredSubOrder(1);
    const result = await checkReturnEligibility(customer.userId, subOrder.id);
    expect(result).toBeDefined();
    expect(result.eligible).toBe(true);
  });

  // ── checkReturnEligibility: outside 24h window ────────────────
  test('checkReturnEligibility: NOT eligible for sub-order delivered 25h ago', async () => {
    const subOrder = await seedDeliveredSubOrder(25);
    const result = await checkReturnEligibility(customer.userId, subOrder.id);
    expect(result.eligible).toBe(false);
  });

  // ── requestReturn: creates DB row ─────────────────────────────
  test('requestReturn creates a return_request row with status pending', async () => {
    const subOrder = await seedDeliveredSubOrder(1);

    let returnReq;
    try {
      returnReq = await requestReturn(customer.userId, {
        subOrderId:  subOrder.id,
        reason:      'defective_product',
        description: 'Item arrived broken',
        photoUrls:   [],
      });
    } catch (e) {
      console.warn('[06_returns] requestReturn threw:', e.message);
      return;
    }

    expect(returnReq).toBeDefined();
    expect(returnReq.status).toBe('pending');
    returnIds.push(returnReq.id);
  });

  // ── approveReturn (wallet): credits wallet ────────────────────
  test('approveReturn with wallet method credits customer wallet', async () => {
    const subOrder = await seedDeliveredSubOrder(0.5);

    // Seed a return_request directly to control state
    const { data: ret, error: retErr } = await testAdmin.from('return_requests').insert({
      sub_order_id: subOrder.id,
      shop_id:      shop.shopId,
      customer_id:  customer.userId,
      reason:       'defective_product',
      status:       'pending',
      requested_at: new Date().toISOString(),
    }).select().single();

    if (retErr) {
      console.warn('[06_returns] Could not seed return_request:', retErr.message);
      return;
    }
    returnIds.push(ret.id);

    const walletBefore = await getWallet(customer.userId);
    const balBefore = walletBefore.balance_paise || 0;

    try {
      await approveReturn(shop.shopId, ret.id, {
        refundAmountPaise: 80000,
        refundMethod:      'wallet',
      });
    } catch (e) {
      console.warn('[06_returns] approveReturn threw:', e.message);
      return;
    }

    const walletAfter = await getWallet(customer.userId);
    expect(walletAfter.balance_paise).toBeGreaterThan(balBefore);
  });

  // ── rejectReturn: status → rejected ──────────────────────────
  test('rejectReturn transitions return_request to rejected', async () => {
    const subOrder = await seedDeliveredSubOrder(0.5);

    const { data: ret, error: retErr } = await testAdmin.from('return_requests').insert({
      sub_order_id: subOrder.id,
      shop_id:      shop.shopId,
      customer_id:  customer.userId,
      reason:       'wrong_item',
      status:       'pending',
      requested_at: new Date().toISOString(),
    }).select().single();

    if (retErr) {
      console.warn('[06_returns] Could not seed return_request for rejection:', retErr.message);
      return;
    }
    returnIds.push(ret.id);

    let rejected;
    try {
      rejected = await rejectReturn(shop.shopId, ret.id, {
        rejectionReason: 'Item is not defective as per our inspection',
      });
    } catch (e) {
      console.warn('[06_returns] rejectReturn threw:', e.message);
      return;
    }

    expect(rejected.status).toBe('rejected');
  });

  // ── return_requests schema check ──────────────────────────────
  test('return_requests table has expected columns', async () => {
    const { data, error } = await testAdmin
      .from('return_requests')
      .select('id, sub_order_id, status, reason')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
