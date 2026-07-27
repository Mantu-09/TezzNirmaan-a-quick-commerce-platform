// ────────────────────────────────────────────────────────────
// Bulk Inventory Controller — P1-D
//
// POST /shop/inventory/bulk-upload   multipart/form-data { file }
// GET  /shop/inventory/bulk-template  → download CSV template
// ────────────────────────────────────────────────────────────
import multer from 'multer';
import { bulkUploadInventory, CSV_TEMPLATE } from '../services/bulk-inventory.service.js';
import logger from '../utils/logger.js';

// ── Multer — memory storage (no disk writes, file stays in RAM) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5 MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (!allowed.includes(file.mimetype) && !file.originalname.endsWith('.csv')) {
      return cb(new Error('Only CSV files are accepted'), false);
    }
    cb(null, true);
  },
});

// Exported so shop.routes.js can insert it as middleware
export const uploadMiddleware = upload.single('file');

// ── Handlers ─────────────────────────────────────────────────

/**
 * POST /shop/inventory/bulk-upload
 * Accepts multipart/form-data with a single 'file' field (CSV).
 */
export async function bulkUpload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Send a CSV as form-data field "file".' });
    }

    const shopId = req.shopId;
    logger.info('bulk-upload: received', {
      shopId,
      filename: req.file.originalname,
      sizeBytes: req.file.size,
    });

    const results = await bulkUploadInventory(shopId, req.file.buffer);

    // HTTP 200 even when there are row errors — the upload "succeeded",
    // individual row failures are reported in results.errors
    res.json({
      success: true,
      data: results,
      message: buildSummaryMessage(results),
    });
  } catch (err) {
    // Top-level errors (bad CSV structure, too many rows, etc.)
    logger.error('bulk-upload: top-level error', { error: err.message, shopId: req.shopId });
    next(err);
  }
}

/**
 * GET /shop/inventory/bulk-template
 * Returns the CSV template file as a download.
 */
export async function downloadTemplate(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="tezznirmaan_inventory_template.csv"');
  res.send(CSV_TEMPLATE);
}

// ── Helpers ──────────────────────────────────────────────────

function buildSummaryMessage({ created, updated, errors }) {
  const parts = [];
  if (created > 0) parts.push(`${created} product${created !== 1 ? 's' : ''} added`);
  if (updated > 0) parts.push(`${updated} updated`);
  if (errors.length > 0) parts.push(`${errors.length} row${errors.length !== 1 ? 's' : ''} skipped (see errors)`);
  return parts.length > 0 ? parts.join(', ') : 'No changes made';
}
