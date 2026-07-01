import { z } from 'zod';
import { PAYMENT_METHODS } from '../config/constants.js';

// ────────────────────────────────────────────────────────────
// Customer Endpoint Validators (Zod Schemas)
// ────────────────────────────────────────────────────────────

/** GET /shops/nearby?lat=...&lng=... */
export const nearbyShopsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/** GET /shops/:shopId/products?category=...&search=...&page=...&limit=... */
export const browseProductsQuerySchema = z.object({
  category: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** POST /cart/items */
export const addToCartSchema = z.object({
  shopId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive('Quantity must be positive'),
});

/** PATCH /cart/items/:itemId */
export const updateCartItemSchema = z.object({
  quantity: z.number().positive('Quantity must be positive'),
});

/** POST /orders/preview */
export const previewOrderSchema = z.object({
  addressId: z.string().uuid(),
});

/** POST /orders */
export const placeOrderSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.enum([
    PAYMENT_METHODS.UPI,
    PAYMENT_METHODS.COD,
    PAYMENT_METHODS.CARD,
    PAYMENT_METHODS.NETBANKING,
    PAYMENT_METHODS.WALLET,
  ]),
  notes: z.string().max(500).optional(),
  scheduledSlot: z
    .object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    })
    .optional(),
});

/** POST /orders/:orderId/cancel */
export const cancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

/** POST /addresses */
export const createAddressSchema = z.object({
  label: z.string().max(50).default('Home'),
  fullName: z.string().min(1).max(200),
  phone: z.string().min(10).max(15),
  addressLine1: z.string().min(1).max(500),
  addressLine2: z.string().max(500).optional(),
  landmark: z.string().max(200).optional(),
  city: z.string().max(100).default('Patna'),
  state: z.string().max(100).default('Bihar'),
  pincode: z.string().min(6).max(6),
  location: z
    .object({
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
    })
    .optional(),
  isDefault: z.boolean().default(false),
});

/** PATCH /addresses/:id */
export const updateAddressSchema = createAddressSchema.partial();

/** PATCH /profile */
export const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
});

/** Common UUID param validator */
export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const shopIdParamSchema = z.object({
  shopId: z.string().uuid(),
});

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid(),
});
