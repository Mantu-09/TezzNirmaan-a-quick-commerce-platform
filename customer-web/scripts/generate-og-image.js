#!/usr/bin/env node
// ────────────────────────────────────────────────────────────
// TezzNirmaan — OG Image Generator — P4-1A
//
// Generates dashboard/public/og-image.png programmatically
// using the `canvas` npm package (pure Node, no browser needed).
//
// Usage:
//   node scripts/generate-og-image.js
//   node scripts/generate-og-image.js --out ./public/og-image.png
//
// Install deps (if not already):
//   npm install canvas
//
// Output: 1200×630px PNG, suitable for OpenGraph and Twitter cards.
// The generated file is committed to git so CI doesn't need canvas.
// ────────────────────────────────────────────────────────────

import { createCanvas } from 'canvas';
import fs               from 'fs';
import path             from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────
const W   = 1200;
const H   = 630;
const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : path.join(__dirname, '..', 'public', 'og-image.png');

// Brand colours
const COL = {
  dark:   '#1A1A18',
  orange: '#E8521A',
  white:  '#FFFFFF',
  muted:  '#6B6B69',
  border: 'rgba(255,255,255,0.12)',
};

// ── Canvas ────────────────────────────────────────────────
const canvas = createCanvas(W, H);
const ctx    = canvas.getContext('2d');

// Background
ctx.fillStyle = COL.dark;
ctx.fillRect(0, 0, W, H);

// ── Decorative right-side geometry ───────────────────────
// Subtle grid of dots (construction-site blueprint aesthetic)
ctx.fillStyle = 'rgba(255,255,255,0.04)';
for (let x = 600; x < W; x += 40) {
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Large orange accent circle (top right)
ctx.beginPath();
ctx.arc(1080, -60, 220, 0, Math.PI * 2);
ctx.strokeStyle = COL.orange;
ctx.lineWidth   = 2;
ctx.globalAlpha = 0.18;
ctx.stroke();
ctx.globalAlpha = 1;

// Cement bag outline (right side, ~700,200)
function drawCementBag(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = COL.orange;
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.globalAlpha = 0.55;

  // Bag body
  ctx.beginPath();
  ctx.roundRect(-55, -80, 110, 160, 8);
  ctx.stroke();

  // Fold at top
  ctx.beginPath();
  ctx.moveTo(-55, -65); ctx.lineTo(55, -65);
  ctx.stroke();

  // Label area
  ctx.beginPath();
  ctx.roundRect(-38, -40, 76, 60, 4);
  ctx.stroke();

  // Horizontal stripes on label
  for (let i = -20; i <= 20; i += 10) {
    ctx.beginPath();
    ctx.moveTo(-28, i); ctx.lineTo(28, i);
    ctx.globalAlpha = 0.25;
    ctx.stroke();
    ctx.globalAlpha = 0.55;
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// Paint can outline (right side)
function drawPaintCan(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = COL.orange;
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.globalAlpha = 0.45;

  // Can body
  ctx.beginPath();
  ctx.roundRect(-40, -60, 80, 120, 6);
  ctx.stroke();

  // Lid
  ctx.beginPath();
  ctx.roundRect(-44, -68, 88, 16, 4);
  ctx.stroke();

  // Handle arc
  ctx.beginPath();
  ctx.arc(0, -68, 28, Math.PI, 0);
  ctx.stroke();

  // Label stripe
  ctx.fillStyle = COL.orange;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(-40, -20, 80, 40);
  ctx.globalAlpha = 0.45;

  ctx.globalAlpha = 1;
  ctx.restore();
}

// Tile stack (right side)
function drawTileStack(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = COL.orange;
  ctx.lineWidth   = 2;
  ctx.globalAlpha = 0.4;

  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.roundRect(-50 + i * 4, -70 + i * 16, 96, 12, 2);
    ctx.stroke();
  }

  // Cross-hatch on top tile
  ctx.beginPath();
  ctx.moveTo(-46, -58); ctx.lineTo(-46 + 90, -58);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-1, -70); ctx.lineTo(-1, -58);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.restore();
}

drawCementBag(800, 250, 1.3);
drawPaintCan(960, 320, 1.2);
drawTileStack(880, 450, 1.1);

// Thin vertical divider between left content and right artwork
ctx.strokeStyle = COL.border;
ctx.lineWidth   = 1;
ctx.beginPath();
ctx.moveTo(690, 60); ctx.lineTo(690, H - 60);
ctx.stroke();

// ── Left side: brand content ──────────────────────────────
const LEFT  = 72;
let   curY  = 160;

// "Tezz" — white
ctx.fillStyle = COL.white;
ctx.font      = 'bold 96px "Arial Black", "Arial", sans-serif';
ctx.fillText('Tezz', LEFT, curY);

// "Nirmaan" — orange (measure Tezz width to continue inline)
const tezzW = ctx.measureText('Tezz').width;
ctx.fillStyle = COL.orange;
ctx.fillText('Nirmaan', LEFT + tezzW + 4, curY);

curY += 60;

// Tagline
ctx.fillStyle = COL.white;
ctx.font      = '500 32px "Arial", sans-serif';
ctx.globalAlpha = 0.88;
ctx.fillText('Hardware. Paint. Tiles. In 60 minutes.', LEFT, curY);
ctx.globalAlpha = 1;

curY += 36;

// Orange rule
ctx.strokeStyle = COL.orange;
ctx.lineWidth   = 3;
ctx.beginPath();
ctx.moveTo(LEFT, curY); ctx.lineTo(LEFT + 280, curY);
ctx.stroke();

curY += 50;

// Description line
ctx.fillStyle = COL.muted;
ctx.font      = '400 22px "Arial", sans-serif';
ctx.fillText('Delivered from local shops in Patna', LEFT, curY);

// ── Bottom: trust stats ───────────────────────────────────
const statsY = H - 72;
const stats  = [
  { val: '1,200+', label: 'Orders delivered' },
  { val: '8',      label: 'Partner shops'    },
  { val: '52 min', label: 'Avg delivery'     },
];

stats.forEach(({ val, label }, i) => {
  const x = LEFT + i * 200;

  ctx.fillStyle = COL.orange;
  ctx.font      = 'bold 28px "Arial", sans-serif';
  ctx.fillText(val, x, statsY);

  ctx.fillStyle = COL.muted;
  ctx.font      = '400 15px "Arial", sans-serif';
  ctx.fillText(label, x, statsY + 22);
});

// Bottom-right: URL
ctx.fillStyle = COL.muted;
ctx.font      = '400 16px "Arial", sans-serif';
ctx.textAlign = 'right';
ctx.fillText('tezznirmaan.in', W - 72, H - 52);

// ── Write output ──────────────────────────────────────────
const dir = path.dirname(OUT);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const stream = fs.createWriteStream(OUT);
canvas.createPNGStream().pipe(stream);
stream.on('finish', () => {
  console.log(`✅  OG image written → ${OUT}`);
  console.log(`    Size: ${W}×${H}px`);
});
stream.on('error', (err) => {
  console.error('❌  Failed to write OG image:', err.message);
  process.exit(1);
});
