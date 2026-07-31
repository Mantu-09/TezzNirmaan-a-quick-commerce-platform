// ────────────────────────────────────────────────────────────
// image.service.js — P7-5: CDN Image Delivery
//
// Manages image uploads to Cloudflare R2 via S3-compatible API.
//
// Architecture:
//   1. Client calls POST /shop/images/upload-url → gets presigned PUT URL
//   2. Client PUTs image bytes directly to R2 (never touches Node.js)
//   3. Client stores the returned public_url (CDN URL) in the database
//
// R2 Setup (do once in Cloudflare dashboard):
//   1. R2 → Create bucket → tezznirmaan-images
//   2. Settings → Public access → Enable
//   3. Custom domain → images.tezznirmaan.in → CNAME to pub-xxx.r2.dev
//   4. R2 → Manage R2 API Tokens → Create token (Object Read & Write)
//      → Copy Account ID, Access Key ID, Secret Access Key
//
// Required environment variables:
//   R2_ACCOUNT_ID         — Cloudflare account ID
//   R2_ACCESS_KEY_ID      — R2 API token key
//   R2_SECRET_ACCESS_KEY  — R2 API token secret
//   R2_BUCKET_NAME        — bucket name (default: tezznirmaan-images)
//   R2_CDN_URL            — public CDN base URL (e.g. https://images.tezznirmaan.in)
// ────────────────────────────────────────────────────────────

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID }   from 'crypto';
import logger           from '../utils/logger.js';

const ACCOUNT_ID      = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID   = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY      = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME     = process.env.R2_BUCKET_NAME    || 'tezznirmaan-images';
const CDN_URL         = process.env.R2_CDN_URL         || '';

// ── R2 client (S3-compatible) ─────────────────────────────────
let _r2Client = null;

function getR2Client() {
  if (_r2Client) return _r2Client;
  if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_KEY) {
    throw new Error('R2 not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  }
  _r2Client = new S3Client({
    region:      'auto',
    endpoint:    `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     ACCESS_KEY_ID,
      secretAccessKey: SECRET_KEY,
    },
    // R2 doesn't require checksum by default
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return _r2Client;
}

// ── Allowed content types ─────────────────────────────────────
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif',
]);

function extFromContentType(contentType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg':  'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
  };
  return map[contentType] || 'jpg';
}

// ── isR2Configured — safe check for optional env ──────────────
export function isR2Configured() {
  return !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_KEY && CDN_URL);
}

// ── getUploadUrl ───────────────────────────────────────────────
/**
 * Generate a presigned PUT URL for direct client-side upload to R2.
 * The client uploads directly; backend only stores the CDN URL.
 *
 * @param {string} folder        - Logical folder: 'products' | 'shops' | 'returns'
 * @param {string} contentType   - MIME type: 'image/jpeg' | 'image/png' | 'image/webp'
 * @returns {{ upload_url: string, public_url: string, key: string }}
 */
export async function getUploadUrl(folder = 'products', contentType = 'image/jpeg') {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error(`Unsupported image type: ${contentType}. Allowed: jpeg, png, webp, avif`);
  }

  const ext    = extFromContentType(contentType);
  const key    = `${folder}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket:       BUCKET_NAME,
    Key:          key,
    ContentType:  contentType,
    CacheControl: 'public, max-age=31536000, immutable', // 1 year — images are write-once
  });

  const r2 = getR2Client();

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 min
  const publicUrl = `${CDN_URL}/${key}`;

  logger.info(`[Image] Presigned URL generated: key=${key}`);

  return { upload_url: uploadUrl, public_url: publicUrl, key };
}

// ── getCDNUrl ─────────────────────────────────────────────────
/**
 * Convert a stored key or legacy Supabase Storage URL into a CDN URL.
 * Handles three cases:
 *   1. null/undefined → null
 *   2. Full URL (http/https) → returned as-is (legacy Supabase Storage)
 *   3. R2 key (e.g. products/uuid.jpg) → CDN_URL/key
 *
 * @param {string|null} keyOrUrl
 * @returns {string|null}
 */
export function getCDNUrl(keyOrUrl) {
  if (!keyOrUrl) return null;
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    return keyOrUrl; // Already a full URL (legacy Supabase Storage or absolute)
  }
  if (!CDN_URL) return null;
  return `${CDN_URL}/${keyOrUrl}`;
}

// ── deleteImage ───────────────────────────────────────────────
/**
 * Delete an image from R2. Skips legacy full URLs (Supabase Storage).
 * Non-fatal: logs warning on failure instead of throwing.
 *
 * @param {string|null} keyOrUrl
 */
export async function deleteImage(keyOrUrl) {
  if (!keyOrUrl) return;
  if (keyOrUrl.startsWith('http')) {
    // Legacy Supabase Storage URL — cannot delete from R2, skip
    return;
  }

  try {
    const r2 = getR2Client();
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyOrUrl }));
    logger.info(`[Image] Deleted: key=${keyOrUrl}`);
  } catch (err) {
    logger.warn(`[Image] Delete failed (non-fatal): key=${keyOrUrl} err=${err.message}`);
  }
}
