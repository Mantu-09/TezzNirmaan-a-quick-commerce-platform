// ────────────────────────────────────────────────────────────
// imageUpload.js — P7-5: CDN Image Upload (Mobile)
//
// Utilities for picking, resizing, and uploading images directly
// to Cloudflare R2 via presigned PUT URL.
//
// Flow:
//   1. Pick from library or capture with camera
//   2. Resize to max 1200px (reduce bandwidth, keep quality)
//   3. Fetch presigned URL from backend  (POST /shop/images/upload-url)
//   4. PUT bytes directly to R2 (never passes through Node.js backend)
//   5. Return CDN URL → caller saves to DB
//
// Dependencies (already in Expo SDK):
//   expo-image-picker
//   expo-image-manipulator
// ────────────────────────────────────────────────────────────
import * as ImagePicker      from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import client                from './client';   // mobile axios client with auth

// ── Request permission helper (needed on iOS 14+) ─────────────
async function ensureMediaLibraryPermission() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Photo library permission is required to upload images.');
  }
}

async function ensureCameraPermission() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Camera permission is required to take a photo.');
  }
}

// ── getPresignedUrl — calls backend ───────────────────────────
async function getPresignedUrl(folder, contentType = 'image/jpeg') {
  const result = await client.post('/shop/images/upload-url', {
    folder,
    content_type: contentType,
  });
  // client.js unwraps { success, data } → result is the data object directly
  return result; // { upload_url, public_url, key }
}

// ── uploadToR2 — direct PUT to Cloudflare R2 ─────────────────
async function uploadToR2(uploadUrl, fileUri, contentType) {
  // Fetch the local file as a blob
  const localRes = await fetch(fileUri);
  const blob     = await localRes.blob();

  const response = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': contentType },
    body:    blob,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed: HTTP ${response.status} ${response.statusText}`);
  }
}

// ── resizeImage ───────────────────────────────────────────────
async function resizeImage(uri, maxWidth = 1200) {
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );
  return resized.uri;
}

// ── pickAndUploadImage ────────────────────────────────────────
/**
 * Pick an image from the photo library, resize it, upload to R2.
 *
 * @param {'products'|'shops'|'returns'|'avatars'} folder
 * @param {{ aspect?: [number, number], maxWidth?: number }} options
 * @returns {Promise<string|null>} CDN URL, or null if user cancelled
 */
export async function pickAndUploadImage(folder = 'products', options = {}) {
  await ensureMediaLibraryPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality:    0.9,               // picked quality (we re-compress below anyway)
    aspect:     options.aspect || [4, 3],
    allowsEditing: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset     = result.assets[0];
  const maxWidth  = options.maxWidth || 1200;

  // Resize if image is wider than maxWidth
  const finalUri  = asset.width > maxWidth
    ? await resizeImage(asset.uri, maxWidth)
    : asset.uri;

  const { upload_url, public_url } = await getPresignedUrl(folder, 'image/jpeg');
  await uploadToR2(upload_url, finalUri, 'image/jpeg');

  return public_url;
}

// ── pickAndUploadReturnPhoto ──────────────────────────────────
/**
 * Capture a return photo using the camera and upload to R2.
 * Higher quality (0.9) since evidence photos need to be clear.
 *
 * @returns {Promise<string|null>} CDN URL, or null if user cancelled
 */
export async function pickAndUploadReturnPhoto() {
  await ensureCameraPermission();

  const result = await ImagePicker.launchCameraAsync({
    quality:       0.9,
    allowsEditing: false,
    exif:          false, // don't include location metadata
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];

  const { upload_url, public_url } = await getPresignedUrl('returns', 'image/jpeg');
  await uploadToR2(upload_url, asset.uri, 'image/jpeg');

  return public_url;
}

// ── pickMultipleAndUpload ─────────────────────────────────────
/**
 * Pick up to `limit` images and upload all of them to R2.
 * Returns an array of CDN URLs (empty array if cancelled).
 *
 * @param {'products'|'shops'|'returns'} folder
 * @param {number} limit  - max images to pick (default: 5)
 * @returns {Promise<string[]>}
 */
export async function pickMultipleAndUpload(folder = 'returns', limit = 5) {
  await ensureMediaLibraryPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality:    0.9,
    allowsMultipleSelection: true,
    selectionLimit:          limit,
  });

  if (result.canceled || !result.assets?.length) return [];

  // Upload all in parallel
  const urls = await Promise.all(
    result.assets.map(async (asset) => {
      const finalUri = asset.width > 1200
        ? await resizeImage(asset.uri, 1200)
        : asset.uri;
      const { upload_url, public_url } = await getPresignedUrl(folder, 'image/jpeg');
      await uploadToR2(upload_url, finalUri, 'image/jpeg');
      return public_url;
    })
  );

  return urls;
}
