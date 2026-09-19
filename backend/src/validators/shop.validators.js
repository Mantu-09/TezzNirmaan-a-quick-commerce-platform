import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// Shop Dashboard Validators (Zod Schemas)
// ────────────────────────────────────────────────────────────

/** GET /shop/orders?status=...&tier=... */
export const shopOrdersQuerySchema = z.object({
  status: z.string().optional(),
  tier: z.enum(['quick', 'scheduled']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** POST /shop/orders/:subOrderId/reject */
export const rejectSubOrderSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
});

/** POST /shop/orders/:subOrderId/assign-rider */
export const assignRiderSchema = z.object({
  riderId: z.string().uuid('Valid rider ID is required'),
});

/** POST /shop/inventory — Add product to shop's inventory */
export const addToInventorySchema = z.object({
  productId: z.string().uuid(),
  price: z.number().positive('Price must be positive'),
  mrp: z.number().positive().optional(),
  costPrice: z.number().positive().optional(),
  stockQuantity: z.number().nonnegative('Stock cannot be negative'),
  lowStockThreshold: z.number().nonnegative().default(5),
  isListed: z.boolean().default(true),
  // Phase 12 additions (migration 081)
  shopSku:         z.string().max(100).optional(),
  shopImages:      z.array(z.string().url()).default([]),
  shopDescription: z.string().max(5000).optional(),
});

/** PATCH /shop/inventory/:inventoryId — Update inventory item */
export const updateInventoryItemSchema = z.object({
  price: z.number().positive().optional(),
  mrp: z.number().positive().optional(),
  costPrice: z.number().positive().optional(),
  stockQuantity: z.number().nonnegative().optional(),
  lowStockThreshold: z.number().nonnegative().optional(),
  isListed: z.boolean().optional(),
  
  // Accept snake_case variants from dashboard / mobile directly
  cost_price: z.number().positive().optional(),
  stock_quantity: z.number().nonnegative().optional(),
  low_stock_threshold: z.number().nonnegative().optional(),
  is_listed: z.boolean().optional(),

  // Phase 12 additions (migration 081)
  shopSku:         z.string().max(100).optional(),
  shopImages:      z.array(z.string().url()).optional(),
  shopDescription: z.string().max(5000).optional(),
  shop_sku:        z.string().max(100).optional(),
  shop_images:     z.array(z.string().url()).optional(),
  shop_description: z.string().max(5000).optional(),
});

/** PATCH /shop/inventory/bulk-update */
export const bulkUpdateInventorySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        price: z.number().positive().optional(),
        stockQuantity: z.number().nonnegative().optional(),
        isListed: z.boolean().optional(),
      })
    )
    .min(1, 'At least one item is required')
    .max(100, 'Cannot update more than 100 items at once'),
});

/** GET /shop/inventory?search=...&inStock=...&page=... */
export const inventoryQuerySchema = z.object({
  search: z.string().max(200).optional(),
  inStock: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** PATCH /shop/settings */
export const updateShopSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  phone: z.string().min(10).max(15).optional(),
  email: z.string().email().optional(),
  addressLine1: z.string().max(500).optional(),
  addressLine2: z.string().max(500).optional(),
  pincode: z.string().min(6).max(6).optional(),
  quickDeliveryRadiusKm: z.number().positive().max(50).optional(),
  scheduledDeliveryRadiusKm: z.number().positive().max(100).optional(),
  operatingHours: z.record(z.string(), z.any()).optional(),
});

/** Common sub-order ID param */
export const subOrderIdParamSchema = z.object({
  subOrderId: z.string().uuid(),
});

/** Common inventory ID param */
export const inventoryIdParamSchema = z.object({
  inventoryId: z.string().uuid(),
});
