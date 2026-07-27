// ────────────────────────────────────────────────────────────
// order.service.js — P5-4A: Proxy / Re-exporter
//
// This file was split into focused sub-modules in P5-4A.
// It now proxies all exports to the order/ subdirectory index
// so every existing import continues to resolve without change:
//
//   import { placeOrder } from '../services/order.service.js'  ✓
//   import { getOrders  } from '../services/order.service.js'  ✓
//
// Sub-modules:
//   order/order-placement.service.js  — previewOrder, placeOrder, previewBasket, placeBasketOrder
//   order/order-history.service.js    — getOrders, getOrder
//   order/order-lifecycle.service.js  — cancelOrderByCustomer, cancelOrder, updateSubOrderStatus
// ────────────────────────────────────────────────────────────
export * from './order/order.service.js';
