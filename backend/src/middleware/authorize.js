import { AuthorizationError } from '../utils/errors.js';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Role-based authorization middleware factory.
 *
 * Usage:
 *   router.get('/admin/shops', authenticate, requireRole('platform_admin'), handler)
 *   router.post('/shop/orders/:id/confirm', authenticate, requireRole('shop_owner', 'shop_staff'), handler)
 *
 * @param  {...string} roles - One or more allowed role strings
 * @returns {Function} Express middleware
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('User not authenticated'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AuthorizationError(
          `Role '${req.user.role}' is not authorized. Required: ${roles.join(', ')}`
        )
      );
    }

    next();
  };
}

/**
 * Shop access middleware.
 *
 * Verifies that the authenticated user either:
 *  1. Owns the shop (shops.owner_id = user.id), OR
 *  2. Is staff at the shop (shop_staff table), OR
 *  3. Is a platform_admin (bypass)
 *
 * Looks for the shop ID in:
 *  - req.params.shopId
 *  - req.shopId (set by a previous middleware or controller)
 *
 * If the user is a shop_owner or shop_staff, it also attaches req.shopId
 * by looking up their associated shop from the database.
 */
export async function requireShopAccess(req, _res, next) {
  try {
    // Platform admins bypass shop access checks
    if (req.user.role === 'platform_admin') {
      return next();
    }

    const userId = req.user.id;
    let shopId = req.params.shopId || req.shopId;

    // If shopId isn't in the URL, look up the user's shop
    if (!shopId) {
      if (req.user.role === 'shop_owner') {
        const { data: shop, error } = await supabaseAdmin
          .from('shops')
          .select('id')
          .eq('owner_id', userId)
          .eq('is_active', true)
          .single();

        if (error || !shop) {
          return next(new AuthorizationError('No active shop found for this owner'));
        }

        req.shopId = shop.id;
        return next();
      }

      if (req.user.role === 'shop_staff') {
        const { data: staffRecord, error } = await supabaseAdmin
          .from('shop_staff')
          .select('shop_id')
          .eq('profile_id', userId)
          .eq('is_active', true)
          .single();

        if (error || !staffRecord) {
          return next(new AuthorizationError('No active shop assignment found for this staff member'));
        }

        req.shopId = staffRecord.shop_id;
        return next();
      }

      return next(new AuthorizationError('Shop access denied'));
    }

    // shopId is in the URL — verify the user has access to this specific shop
    if (req.user.role === 'shop_owner') {
      const { data: shop } = await supabaseAdmin
        .from('shops')
        .select('id')
        .eq('id', shopId)
        .eq('owner_id', userId)
        .eq('is_active', true)
        .single();

      if (!shop) {
        return next(new AuthorizationError('You do not own this shop'));
      }

      req.shopId = shopId;
      return next();
    }

    if (req.user.role === 'shop_staff') {
      const { data: staffRecord } = await supabaseAdmin
        .from('shop_staff')
        .select('shop_id')
        .eq('profile_id', userId)
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .single();

      if (!staffRecord) {
        return next(new AuthorizationError('You are not staff at this shop'));
      }

      req.shopId = shopId;
      return next();
    }

    return next(new AuthorizationError('Shop access denied'));
  } catch (err) {
    next(err);
  }
}
