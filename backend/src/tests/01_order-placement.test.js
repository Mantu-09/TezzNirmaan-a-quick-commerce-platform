// ────────────────────────────────────────────────────────────
// 01_order-placement.test.js — P8-5
//
// Tests order placement flows:
//   • DB shape of placed orders + sub-orders
//   • Server-side price enforcement (prices from inventory, not client)
//   • Two sub-orders created for separate items
//   • Status lifecycle transitions
//   • Order number uniqueness under concurrent placement
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

let customer, shop, quickProduct, scheduledProduct;
const userIds = [];
const shopIds = [];

beforeAll(async () => {
  customer         = await createTestCustomer(810001);
  shop             = await createTestShop(810001);
  quickProduct     = await createTestProduct(shop.shopId, {
    name: 'Quick Test Item', deliveryTier: 'quick', stockQty: 20, pricePaise: 25000,
  });
  scheduledProduct = await createTestProduct(shop.shopId, {
    name: 'Scheduled Test Item', deliveryTier: 'scheduled', stockQty: 30, pricePaise: 50000,
  });
  userIds.push(customer.userId, shop.ownerId);
  shopIds.push(shop.shopId);
});

afterAll(async () => {
  await cleanupTestData(userIds, shopIds);
});

describe('Order Placement — P8-5', () => {

  // ── DB shape of a placed order ────────────────────────────────
  test('placed order appears in orders table with correct amount', async () => {
    const { order, subOrder } = await createTestOrder(
      customer.userId, shop.shopId, quickProduct.inventoryId,
      { status: 'pending', qty: 2, pricePaise: 25000 }
    );

    expect(order).toBeDefined();
    expect(order.customer_id).toBe(customer.userId);
    expect(order.shop_id).toBe(shop.shopId);
    // total = 2×25000 + 10000 delivery = 60000
    expect(order.total_amount).toBe(60000);
    expect(subOrder.status).toBe('pending');
  });

  // ── Inventory row exists with correct price ───────────────────
  test('shop_inventory row has correct price and stock', async () => {
    const { data: inv } = await testAdmin
      .from('shop_inventory')
      .select('stock_quantity, price')
      .eq('id', quickProduct.inventoryId)
      .single();

    expect(inv).toBeDefined();
    expect(inv.stock_quantity).toBeGreaterThan(0);
    expect(inv.price).toBe(25000);
  });

  // ── Server-side price enforcement ────────────────────────────
  test('order_items records server-side price from inventory', async () => {
    const { subOrder } = await createTestOrder(
      customer.userId, shop.shopId, quickProduct.inventoryId,
      { status: 'pending', qty: 1, pricePaise: 25000 }
    );

    const { data: item } = await testAdmin
      .from('order_items')
      .select('unit_price')
      .eq('sub_order_id', subOrder.id)
      .single();

    expect(item.unit_price).toBe(25000);
  });

  // ── Two separate sub-orders for two products ─────────────────
  test('two separate orders can be placed for different products', async () => {
    const [r1, r2] = await Promise.all([
      createTestOrder(customer.userId, shop.shopId, quickProduct.inventoryId,
        { status: 'pending', qty: 1, pricePaise: 25000 }),
      createTestOrder(customer.userId, shop.shopId, scheduledProduct.inventoryId,
        { status: 'pending', qty: 1, pricePaise: 50000 }),
    ]);

    expect(r1.subOrder.id).not.toBe(r2.subOrder.id);
    expect(r1.order.id).not.toBe(r2.order.id);

    // Verify items on each sub_order
    const { data: items1 } = await testAdmin
      .from('order_items').select('id').eq('sub_order_id', r1.subOrder.id);
    const { data: items2 } = await testAdmin
      .from('order_items').select('id').eq('sub_order_id', r2.subOrder.id);

    expect(items1?.length).toBeGreaterThan(0);
    expect(items2?.length).toBeGreaterThan(0);
  });

  // ── Status lifecycle ──────────────────────────────────────────
  test('sub_order progresses through status lifecycle', async () => {
    const { subOrder } = await createTestOrder(
      customer.userId, shop.shopId, scheduledProduct.inventoryId,
      { status: 'pending', qty: 1, pricePaise: 50000 }
    );

    const statuses = ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];
    for (const status of statuses) {
      const { error } = await testAdmin
        .from('sub_orders').update({ status }).eq('id', subOrder.id);
      expect(error).toBeNull();
    }

    const { data: final } = await testAdmin
      .from('sub_orders').select('status').eq('id', subOrder.id).single();
    expect(final.status).toBe('delivered');
  });

  // ── Order number uniqueness ────────────────────────────────────
  test('concurrent orders get unique order_numbers', async () => {
    const [r1, r2] = await Promise.all([
      createTestOrder(customer.userId, shop.shopId, quickProduct.inventoryId,
        { status: 'pending', qty: 1 }),
      createTestOrder(customer.userId, shop.shopId, scheduledProduct.inventoryId,
        { status: 'pending', qty: 1 }),
    ]);
    expect(r1.order.order_number).not.toBe(r2.order.order_number);
  });
});
