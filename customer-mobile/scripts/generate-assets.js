#!/usr/bin/env node
// ────────────────────────────────────────────────────────────
// TezzNirmaan — Mobile Asset Generator — P4-1B
//
// Generates all required Expo asset sizes from a single canvas
// render using Node.js `canvas` package.
//
// Outputs (all in mobile/assets/):
//   icon.png              1024×1024  — App Store / Play Store icon
//   adaptive-icon.png     1024×1024  — Android adaptive icon foreground
//   splash.png            2048×2048  — Expo splash screen
//   notification-icon.png   96×96   — Android notification small icon
//   favicon.png             32×32   — Web favicon
//
// Design spec:
//   Background: #E8521A (TezzNirmaan orange)
//   Monogram: "TN" in white, Syne Bold style (heavy, geometric)
//   The T and N share a vertical stroke — they interlock like blocks
//
// Install: npm install canvas (dev only — not bundled in the app)
// Run:     node scripts/generate-assets.js
// ────────────────────────────────────────────────────────────

import { createCanvas } from 'canvas';
import fs               from 'fs';
import path             from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS    = path.join(__dirname, '..', 'assets');

// ── Brand colours ────────────────────────────────────────
const ORANGE = '#E8521A';
const WHITE  = '#FFFFFF';
const DARK   = '#1A1A18';

// ── Asset specs ──────────────────────────────────────────
const SPECS = [
  { name: 'icon.png',              size: 1024, type: 'icon'         },
  { name: 'adaptive-icon.png',     size: 1024, type: 'adaptive'     },
  { name: 'splash.png',            size: 2048, type: 'splash'       },
  { name: 'notification-icon.png', size:   96, type: 'notification' },
  { name: 'favicon.png',           size:   32, type: 'favicon'      },
];

// ────────────────────────────────────────────────────────────
// Draw functions
// ────────────────────────────────────────────────────────────

/**
 * Draw the "TN" interlocked monogram.
 * The T and N share their inner vertical stroke.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx  Centre x
 * @param {number} cy  Centre y
 * @param {number} size  Total monogram height (the icon size / 2)
 */
function drawMonogram(ctx, cx, cy, size) {
  const strokeW = size * 0.13;   // stroke width (thick, bold)
  const height  = size * 0.75;   // total glyph height
  const width   = size * 0.80;   // total glyph width

  ctx.fillStyle = WHITE;
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = strokeW;
  ctx.lineCap  = 'square';
  ctx.lineJoin = 'miter';

  const top    = cy - height / 2;
  const bottom = cy + height / 2;
  const left   = cx - width  / 2;
  const right  = cx + width  / 2;

  // Shared centre vertical (the interlocking column)
  const midX = cx;

  // ── T  ─────────────────────────────────────────────────
  // Top crossbar of T
  ctx.beginPath();
  ctx.moveTo(left, top + strokeW / 2);
  ctx.lineTo(midX + strokeW * 0.5, top + strokeW / 2);
  ctx.stroke();

  // Vertical stem of T (left half)
  ctx.beginPath();
  ctx.moveTo(left + (midX - left) / 2, top);
  ctx.lineTo(left + (midX - left) / 2, bottom);
  ctx.stroke();

  // ── N  ─────────────────────────────────────────────────
  // Left vertical of N (shared with T's right edge)
  ctx.beginPath();
  ctx.moveTo(midX + strokeW * 0.5, top);
  ctx.lineTo(midX + strokeW * 0.5, bottom);
  ctx.stroke();

  // Right vertical of N
  ctx.beginPath();
  ctx.moveTo(right, top);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  // Diagonal of N (top-left to bottom-right)
  ctx.beginPath();
  ctx.moveTo(midX + strokeW * 0.5, top + strokeW / 2);
  ctx.lineTo(right,                 bottom - strokeW / 2);
  ctx.stroke();
}

/**
 * Draw the icon onto a canvas of the given `size`.
 * `type` changes the background and padding ratio.
 */
function renderIcon(size, type) {
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext('2d');

  if (type === 'notification') {
    // Notification icons must be white-on-transparent (Android requirement)
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = WHITE;

    // Simple "TN" text for tiny size
    const fs = Math.floor(size * 0.55);
    ctx.font = `bold ${fs}px Arial`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TN', size / 2, size / 2 + 2);
    return canvas;
  }

  if (type === 'favicon') {
    // 32×32: solid orange square with white "T"
    ctx.fillStyle = ORANGE;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = WHITE;
    ctx.font = `bold ${Math.floor(size * 0.72)}px Arial`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', size / 2, size / 2 + 1);
    return canvas;
  }

  if (type === 'splash') {
    // Splash: dark background, centred logo + tagline
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, size, size);

    // Brand wordmark
    const wordSize = Math.floor(size * 0.09);
    ctx.font      = `bold ${wordSize}px Arial`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // "Tezz" white
    ctx.fillStyle = WHITE;
    const tezzW   = ctx.measureText('Tezz').width;
    const totalW  = ctx.measureText('TezzNirmaan').width;
    const startX  = size / 2 - totalW / 2;

    ctx.fillText('Tezz', startX + tezzW / 2, size / 2 - wordSize * 0.1);

    // "Nirmaan" orange
    ctx.fillStyle = ORANGE;
    ctx.fillText('Nirmaan', startX + tezzW + ctx.measureText('Nirmaan').width / 2, size / 2 - wordSize * 0.1);

    // Tagline
    const tagSize = Math.floor(size * 0.028);
    ctx.font      = `${tagSize}px Arial`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('Hardware. Paint. Tiles. In 60 minutes.', size / 2, size / 2 + wordSize * 0.9);

    // Orange dot under wordmark
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2 + wordSize * 1.7, size * 0.006, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  }

  // ── icon / adaptive-icon ──────────────────────────────
  // Orange background square (adaptive-icon: OS clips to shape)
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 0, size, size);

  // Inner safe-zone padding (adaptive icons should keep content
  // within the central 66% — the OS clips the rest into a shape)
  const padding = type === 'adaptive' ? size * 0.17 : size * 0.14;
  const inner   = size - padding * 2;

  // Draw the TN monogram centred in the safe zone
  drawMonogram(ctx, size / 2, size / 2, inner);

  return canvas;
}

// ────────────────────────────────────────────────────────────
// Write all assets
// ────────────────────────────────────────────────────────────
if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });

let completed = 0;

for (const { name, size, type } of SPECS) {
  const canvas = renderIcon(size, type);
  const out    = path.join(ASSETS, name);
  const stream = fs.createWriteStream(out);

  canvas.createPNGStream().pipe(stream);

  stream.on('finish', () => {
    console.log(`✅  ${name.padEnd(28)} ${size}×${size}px → ${out}`);
    completed++;
    if (completed === SPECS.length) {
      console.log('\n🎉  All assets generated!');
      console.log('   Run `expo prebuild` to verify the assets load correctly.\n');
    }
  });

  stream.on('error', (err) => {
    console.error(`❌  Failed to write ${name}: ${err.message}`);
    process.exit(1);
  });
}
