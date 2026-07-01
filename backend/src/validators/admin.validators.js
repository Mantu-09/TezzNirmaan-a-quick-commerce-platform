import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// Admin Endpoint Validators (Zod Schemas)
// ────────────────────────────────────────────────────────────

/** POST /admin/shops — onboard a new shop */
export const createShopSchema = z.object({
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(2000).optional(),
  phone: z.string().min(10).max(15),
  email: z.string().email().optional(),
  addressLine1: z.string().min(1).max(500),
  addressLine2: z.string().max(500).optional(),
  city: z.string().max(100).default('Patna'),
  state: z.string().max(100).default('Bihar'),
  pincode: z.string().min(6).max(6),
  location: z.object({
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
  }),
  quickDeliveryRadiusKm: z.number().positive().max(50).default(5),
  scheduledDeliveryRadiusKm: z.number().positive().max(100).default(15),
  operatingHours: z.record(z.string(), z.any()).optional(),
});

/** POST /admin/products — add to master catalog */
export const createProductSchema = z.object({
  name: z.string().min(1).max(300),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  deliveryTier: z.enum(['quick', 'scheduled']),
  unit: z.enum([
    'piece', 'kg', 'bag', 'litre', 'meter', 'sq_ft', 'cu_ft',
    'bundle', 'box', 'pair', 'set', 'ton', 'brass', 'cft',
  ]).default('piece'),
  weightKg: z.number().nonnegative().optional(),
  isBulk: z.boolean().default(false),
  hsnCode: z.string().max(20).optional(),
  gstPercent: z.number().nonnegative().max(100).default(18),
  images: z.array(z.string().url()).default([]),
});

/** PATCH /admin/products/:id — edit master product */
export const updateProductSchema = createProductSchema.partial();

/** POST /admin/riders — register a new rider */
export const createRiderSchema = z.object({
  profileId: z.string().uuid(),
  vehicleType: z.enum(['bike', 'scooter', 'tempo', 'loader', 'pickup_truck']),
  vehicleNumber: z.string().max(20).optional(),
  licenseNumber: z.string().max(30).optional(),
  shopIds: z.array(z.string().uuid()).min(1, 'At least one shop assignment is required'),
});

/** GET /admin/orders query */
export const adminOrdersQuerySchema = z.object({
  shopId: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** GET /admin/shops query */
export const adminShopsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** GET /admin/products query */
export const adminProductsQuerySchema = z.object({
  category: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  tier: z.enum(['quick', 'scheduled']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
