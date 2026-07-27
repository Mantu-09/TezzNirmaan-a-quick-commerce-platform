// ────────────────────────────────────────────────────────────
// order/order.service.js — P5-4A: Thin Index Re-exporter
//
// Re-exports everything from the three focused sub-modules.
// All callers that do:
//   import { placeOrder } from '../services/order.service.js'
// continue to work unchanged — they now resolve here first.
// ────────────────────────────────────────────────────────────
export {
  previewOrder,
  placeOrder,
  previewBasket,
  placeBasketOrder,
} from './order-placement.service.js';

export {
  getOrders,
  getOrder,
} from './order-history.service.js';

export {
  cancelOrderByCustomer,
  cancelOrder,
  updateSubOrderStatus,
} from './order-lifecycle.service.js';
