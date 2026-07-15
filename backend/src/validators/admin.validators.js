import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// Admin Endpoint Validators (Zod Schemas)
// ────────────────────────────────────────────────────────────

/** POST /admin/shops — B2: onboard a new shop */
export const createShopSchema = z.object({
  shop_name:                    z.string().min(1).max(200),
  owner_phone:                  z.string().min(10).max(15),
  owner_name:                   z.string().min(1).max(200),
  address_line1:                z.string().min(1).max(500),
  city:                         z.string().max(100).default('Patna'),
  state:                        z.string().max(100).default('Bihar'),
  pincode:                      z.string().length(6),
  lat:                          z.coerce.number().min(-90).max(90),
  lng:                          z.coerce.number().min(-180).max(180),
  quick_delivery_radius_km:     z.coerce.number().positive().max(50).default(5),
  scheduled_delivery_radius_km: z.coerce.number().positive().max(100).default(15),
  operating_hours:              z.record(z.string(), z.any()).optional(),
  description:                  z.string().max(2000).optional(),
});

/** POST /admin/riders — B2: register a new rider */
export const createRiderSchema = z.object({
  name:           z.string().min(1).max(200),
  phone:          z.string().min(10).max(15),
  vehicle_type:   z.enum(['bike', 'scooter', 'cycle', 'tempo', 'other']),
  vehicle_number: z.string().max(20).optional(),
  shop_ids:       z.array(z.string().uuid()).default([]),
});

/** POST /admin/products — add to master catalog */
export const createProductSchema = z.object({
  name:         z.string().min(1).max(300),
  slug:         z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description:  z.string().max(5000).optional(),
  categoryId:   z.string().uuid(),
  brandId:      z.string().uuid().optional(),
  deliveryTier: z.enum(['quick', 'scheduled']),
  unit: z.enum([
    'piece', 'kg', 'bag', 'litre', 'meter', 'sq_ft', 'cu_ft',
    'bundle', 'box', 'pair', 'set', 'ton', 'brass', 'cft',
  ]).default('piece'),
  weightKg:   z.number().nonnegative().optional(),
  isBulk:     z.boolean().default(false),
  hsnCode:    z.string().max(20).optional(),
  gstPercent: z.number().nonnegative().max(100).default(18),
  images:     z.array(z.string().url()).default([]),
});

/** PATCH /admin/products/:id */
export const updateProductSchema = createProductSchema.partial();

/** GET /admin/orders query */
export const adminOrdersQuerySchema = z.object({
  shopId: z.string().uuid().optional(),
  status: z.string().optional(),
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
});

/** GET /admin/shops query */
export const adminShopsQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
});

/** GET /admin/products query */
export const adminProductsQuerySchema = z.object({
  category: z.string().uuid().optional(),
  search:   z.string().max(200).optional(),
  tier:     z.enum(['quick', 'scheduled']).optional(),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(100).default(20),
});
