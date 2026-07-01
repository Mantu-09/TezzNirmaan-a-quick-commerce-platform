// ────────────────────────────────────────────────────────────
// TezzNirmaan — Domain Constants
// Frozen objects prevent accidental mutation at runtime.
// ────────────────────────────────────────────────────────────

/** Human-readable prefix for order numbers: TN-YYMMDD-NNNN */
export const ORDER_NUMBER_PREFIX = 'TN';

/** Delivery tiers — maps to the `delivery_tier` Postgres enum */
export const DELIVERY_TIERS = Object.freeze({
  QUICK: 'quick',
  SCHEDULED: 'scheduled',
});

/** Sub-order lifecycle statuses — maps to the `order_status` Postgres enum */
export const ORDER_STATUSES = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup',
  RIDER_ASSIGNED: 'rider_assigned',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURN_REQUESTED: 'return_requested',
  RETURNED: 'returned',
});

/** Terminal statuses — no further transitions allowed */
export const TERMINAL_STATUSES = Object.freeze([
  ORDER_STATUSES.REJECTED,
  ORDER_STATUSES.CANCELLED,
  ORDER_STATUSES.DELIVERED,
  ORDER_STATUSES.RETURNED,
]);

/** User roles — maps to the `user_role` Postgres enum */
export const USER_ROLES = Object.freeze({
  CUSTOMER: 'customer',
  SHOP_OWNER: 'shop_owner',
  SHOP_STAFF: 'shop_staff',
  RIDER: 'rider',
  PLATFORM_ADMIN: 'platform_admin',
});

/** Payment methods — maps to the `payment_method` Postgres enum */
export const PAYMENT_METHODS = Object.freeze({
  UPI: 'upi',
  COD: 'cod',
  CARD: 'card',
  NETBANKING: 'netbanking',
  WALLET: 'wallet',
});

/** Payment statuses — maps to the `payment_status` Postgres enum */
export const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUND_INITIATED: 'refund_initiated',
  REFUNDED: 'refunded',
});

/** Rider availability statuses */
export const RIDER_STATUSES = Object.freeze({
  AVAILABLE: 'available',
  ON_DELIVERY: 'on_delivery',
  OFFLINE: 'offline',
});

/** Vehicle types — determines which delivery tier a rider can serve */
export const VEHICLE_TYPES = Object.freeze({
  BIKE: 'bike',
  SCOOTER: 'scooter',
  TEMPO: 'tempo',
  LOADER: 'loader',
  PICKUP_TRUCK: 'pickup_truck',
});

/** Units of measure for products */
export const UNITS_OF_MEASURE = Object.freeze({
  PIECE: 'piece',
  KG: 'kg',
  BAG: 'bag',
  LITRE: 'litre',
  METER: 'meter',
  SQ_FT: 'sq_ft',
  CU_FT: 'cu_ft',
  BUNDLE: 'bundle',
  BOX: 'box',
  PAIR: 'pair',
  SET: 'set',
  TON: 'ton',
  BRASS: 'brass',
  CFT: 'cft',
});

/** Sub-order number suffixes per delivery tier */
export const TIER_SUFFIXES = Object.freeze({
  [DELIVERY_TIERS.QUICK]: 'Q',
  [DELIVERY_TIERS.SCHEDULED]: 'S',
});

/** Default pagination */
export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});
