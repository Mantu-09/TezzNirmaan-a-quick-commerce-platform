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
  // Accept both camelCase (old) and snake_case (mobile AddressForm)
  label:        z.string().max(50).optional().default('home'),

  // Name — accept both conventions
  fullName:     z.string().min(1).max(200).optional(),
  full_name:    z.string().min(1).max(200).optional(),

  phone:        z.string().min(10).max(15),

  // Address lines
  addressLine1: z.string().min(1).max(500).optional(),
  address_line1: z.string().min(1).max(500).optional(),
  addressLine2:  z.string().max(500).optional(),
  address_line2: z.string().max(500).optional(),

  landmark:     z.string().max(200).optional(),
  city:         z.string().max(100).optional().default('Patna'),
  state:        z.string().max(100).optional().default('Bihar'),
  pincode:      z.string().min(6).max(6),

  // GPS coordinates — accepted as flat fields (from expo-location)
  lat:  z.number().min(-90).max(90).nullable().optional(),
  lng:  z.number().min(-180).max(180).nullable().optional(),

  // Legacy nested location object (kept for backward compat)
  location: z
    .object({
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
    })
    .optional(),

  isDefault:   z.boolean().optional().default(false),
  is_default:  z.boolean().optional(),
}).refine(
  data => data.fullName || data.full_name,
  { message: 'full_name is required', path: ['full_name'] }
).refine(
  data => data.addressLine1 || data.address_line1,
  { message: 'address_line1 is required', path: ['address_line1'] }
);

/** PATCH /addresses/:id */
export const updateAddressSchema = z.object({
  label:        z.string().max(50).optional(),
  fullName:     z.string().min(1).max(200).optional(),
  full_name:    z.string().min(1).max(200).optional(),
  phone:        z.string().min(10).max(15).optional(),
  addressLine1:  z.string().min(1).max(500).optional(),
  address_line1: z.string().min(1).max(500).optional(),
  addressLine2:  z.string().max(500).optional(),
  address_line2: z.string().max(500).optional(),
  landmark:     z.string().max(200).optional(),
  city:         z.string().max(100).optional(),
  state:        z.string().max(100).optional(),
  pincode:      z.string().min(6).max(6).optional(),
  lat:          z.number().min(-90).max(90).nullable().optional(),
  lng:          z.number().min(-180).max(180).nullable().optional(),
  location:     z.object({ lng: z.number(), lat: z.number() }).optional(),
  isDefault:    z.boolean().optional(),
  is_default:   z.boolean().optional(),
});

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

// B4: Rating submission
export const rateOrderSchema = z.object({
  delivery_rating: z.coerce.number().int().min(1).max(5).optional(),
  product_rating:  z.coerce.number().int().min(1).max(5).optional(),
  review_text:     z.string().max(1000).optional(),
}).refine(
  data => data.delivery_rating != null || data.product_rating != null,
  { message: 'At least one of delivery_rating or product_rating is required' }
);

