// ────────────────────────────────────────────────────────────
// image.controller.js — P7-5: CDN Image Upload
//
// POST /shop/images/upload-url
// Body: { folder: 'products'|'shops'|'returns', content_type: 'image/jpeg' }
// Response: { upload_url, public_url, key }
//
// The client then:
//   1. PUTs image bytes to upload_url (direct to R2, never through Node)
//   2. Saves public_url in the database (products.primary_image_url, etc.)
// ────────────────────────────────────────────────────────────
import { getUploadUrl, isR2Configured } from '../services/image.service.js';
import { AppError } from '../utils/errors.js';

const ALLOWED_FOLDERS      = new Set(['products', 'shops', 'returns', 'avatars']);
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif',
]);

/**
 * POST /shop/images/upload-url
 * Authenticated: shop_owner, shop_staff
 */
export async function getImageUploadUrl(req, res, next) {
  try {
    if (!isR2Configured()) {
      throw new AppError(
        'Image upload not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_CDN_URL',
        503
      );
    }

    const { folder = 'products', content_type: contentType = 'image/jpeg' } = req.body;

    if (!ALLOWED_FOLDERS.has(folder)) {
      throw new AppError(`Invalid folder. Allowed: ${[...ALLOWED_FOLDERS].join(', ')}`, 400);
    }
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new AppError(`Invalid content_type. Allowed: jpeg, png, webp, avif`, 400);
    }

    const result = await getUploadUrl(folder, contentType);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
