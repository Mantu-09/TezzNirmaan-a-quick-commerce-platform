// ────────────────────────────────────────────────────────────
// 02_payment.test.js — P8-5
//
// Tests payment flows:
//   • COD: payment_method recorded on sub_order
//   • creditWallet: balance increases by exact amount
//   • Cumulative credits accumulate correctly
//   • payments table row insert + capture transition
//   • getWallet: returns balance_paise + transactions array
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
import { creditWallet, getWallet } from '../services/wallet.service.js';

let customer, shop, product;
const userIds = [];
const shopIds = [];

beforeAll(async () => {
  customer = await createTestCustomer(820001);
  shop     = await createTestShop(820001);
  product  = await createTestProduct(shop.shopId, {
    name: 'Payment Test Product', stockQty: 20, pricePaise: 30000,
  });
  userIds.push(customer.userId, shop.ownerId);
  shopIds.push(shop.shopId);
});

afterAll(async () => {
  await cleanupTestData(userIds, shopIds);
});

describe('Payment — P8-5', () => {

  // ── COD payment_method recorded ──────────────────────────────
  test('COD order has payment_method = cod in sub_orders', async () => {
    const { subOrder } = await createTestOrder(
      customer.userId, shop.shopId, product.inventoryId,
      { status: 'pending', qty: 1, pricePaise: 30000 }
    );

    await testAdmin.from('sub_orders')
      .update({ payment_method: 'cod' })
      .eq('id', subOrder.id);

    const { data } = await testAdmin
      .from('sub_orders').select('payment_method').eq('id', subOrder.id).single();
    expect(data.payment_method).toBe('cod');
  });

  // ── creditWallet: balance increases exactly ───────────────────
  test('creditWallet increases wallet balance by exact amount', async () => {
    const amountPaise = 10000; // ₹100

    const before = await getWallet(customer.userId);
    const balanceBefore = before.balance_paise || 0;

    await creditWallet(
      customer.userId,
      amountPaise,
      'credit_cashback',
      null,
      'P8-5 test credit',
      90
    );

    const after = await getWallet(customer.userId);
    expect(after.balance_paise).toBe(balanceBefore + amountPaise);
  });

  // ── Cumulative wallet credits ─────────────────────────────────
  test('wallet balance accumulates across multiple credits', async () => {
    const before = await getWallet(customer.userId);
    const balanceBefore = before.balance_paise || 0;

    await creditWallet(customer.userId, 5000, 'credit_cashback', null, 'Credit 1', 90);
    await creditWallet(customer.userId, 3000, 'credit_referral', null, 'Credit 2', 90);

    const after = await getWallet(customer.userId);
    expect(after.balance_paise).toBe(balanceBefore + 8000);
  });

  // ── payments table row insert ─────────────────────────────────
  test('payments table accepts a valid row with correct shape', async () => {
    const { order } = await createTestOrder(
      customer.userId, shop.shopId, product.inventoryId,
      { status: 'pending', qty: 1, pricePaise: 30000 }
    );

    const { data, error } = await testAdmin.from('payments').insert({
      order_id:          order.id,
      gateway:           'razorpay',
      razorpay_order_id: `order_test_${Date.now()}`,
      amount_paise:      30000,
      currency:          'INR',
      status:            'created',
    }).select().single();

    expect(error).toBeNull();
    expect(data.order_id).toBe(order.id);
    expect(data.status).toBe('created');
  });

  // ── Payment status: created → captured ───────────────────────
  test('payment status can transition from created to captured', async () => {
    const { order } = await createTestOrder(
      customer.userId, shop.shopId, product.inventoryId,
      { status: 'pending', qty: 1, pricePaise: 30000 }
    );

    const { data: payment } = await testAdmin.from('payments').insert({
      order_id:          order.id,
      gateway:           'razorpay',
      razorpay_order_id: `order_test_${Date.now()}`,
      amount_paise:      30000,
      currency:          'INR',
      status:            'created',
    }).select().single();

    const { error } = await testAdmin.from('payments').update({
      status:              'captured',
      razorpay_payment_id: `pay_test_${Date.now()}`,
      captured_at:         new Date().toISOString(),
    }).eq('id', payment.id);

    expect(error).toBeNull();

    const { data: updated } = await testAdmin
      .from('payments').select('status').eq('id', payment.id).single();
    expect(updated.status).toBe('captured');
  });

  // ── getWallet shape ───────────────────────────────────────────
  test('getWallet returns balance_paise and transactions array', async () => {
    const wallet = await getWallet(customer.userId);
    expect(typeof wallet.balance_paise).toBe('number');
    expect(Array.isArray(wallet.transactions)).toBe(true);
  });
});
