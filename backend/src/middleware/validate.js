import { ValidationError } from '../utils/errors.js';

/**
 * Request validation middleware factory using Zod schemas.
 *
 * Validates parts of the request object against a Zod schema and
 * replaces req.body / req.query / req.params with the parsed
 * (coerced + stripped) result on success.
 *
 * Usage:
 *   import { z } from 'zod';
 *   const addToCartSchema = z.object({ ... });
 *
 *   router.post('/cart/items', authenticate, validate(addToCartSchema), controller.addToCart);
 *   router.get('/shops/nearby', validate(nearbyQuerySchema, 'query'), controller.getNearbyShops);
 *
 * @param {import('zod').ZodSchema} schema   - Zod schema to validate against
 * @param {'body'|'query'|'params'} source   - Which part of the request to validate (default: 'body')
 * @returns {Function} Express middleware
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      return next(new ValidationError('Request validation failed', details));
    }

    // Replace with parsed data (coerced types, stripped unknown keys)
    req[source] = result.data;
    next();
  };
}
