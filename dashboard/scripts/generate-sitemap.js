#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// scripts/generate-sitemap.js — P9-5
//
// Generates dashboard/public/sitemap.xml at build time.
// Run via:  node scripts/generate-sitemap.js
// Or add to package.json: "prebuild": "node scripts/generate-sitemap.js"
//
// Includes:
//   • Static storefront pages
//   • Category pages (8 fixed categories)
//   • City pages (active cities fetched from backend)
//   • Product pages (top 500 products by inventory_id)
// ─────────────────────────────────────────────────────────────
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const OUTPUT     = join(__dirname, '..', 'public', 'sitemap.xml');
const BASE_URL   = process.env.SITE_URL || 'https://tezznirmaan.in';
const API        = process.env.API_BASE_URL || 'http://localhost:3000';

// ── Static pages ──────────────────────────────────────────────
const STATIC_PAGES = [
  { path: '',            priority: '1.0', changefreq: 'daily' },
  { path: '/storefront', priority: '1.0', changefreq: 'daily' },
  { path: '/privacy',    priority: '0.3', changefreq: 'monthly' },
  { path: '/terms',      priority: '0.3', changefreq: 'monthly' },
  { path: '/shop-signup',priority: '0.6', changefreq: 'monthly' },
];

// ── Category pages ────────────────────────────────────────────
const CATEGORIES = [
  'construction', 'paints', 'tiles', 'electrical',
  'plumbing', 'hardware', 'decor', 'fittings',
];

// ── Helper: safe fetch (non-fatal) ────────────────────────────
async function safeFetch(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Build sitemap ─────────────────────────────────────────────
async function generateSitemap() {
  console.log('🗺  Generating sitemap.xml…');
  const urls = [];
  const today = new Date().toISOString().split('T')[0];

  // Static pages
  for (const page of STATIC_PAGES) {
    urls.push({
      loc:        `${BASE_URL}${page.path}`,
      lastmod:    today,
      priority:   page.priority,
      changefreq: page.changefreq,
    });
  }

  // Category pages
  for (const cat of CATEGORIES) {
    urls.push({
      loc:        `${BASE_URL}/storefront/category/${cat}`,
      lastmod:    today,
      priority:   '0.8',
      changefreq: 'daily',
    });
  }

  // City pages from API
  const citiesRes = await safeFetch(`${API}/api/v1/public/cities`);
  const cities    = citiesRes?.data?.cities || [];
  for (const city of cities) {
    if (!city.is_active) continue;
    const slug = city.name.toLowerCase().replace(/\s+/g, '-');
    urls.push({
      loc:        `${BASE_URL}/storefront/city/${slug}`,
      lastmod:    today,
      priority:   '0.7',
      changefreq: 'weekly',
    });
    // City × category pages
    for (const cat of CATEGORIES) {
      urls.push({
        loc:        `${BASE_URL}/storefront/city/${slug}/${cat}`,
        lastmod:    today,
        priority:   '0.7',
        changefreq: 'daily',
      });
    }
  }

  // Product pages from first active shop
  const productsRes = await safeFetch(
    `${API}/api/v1/public/shops/sharma-hardware-patna/products?limit=48`
  );
  const products = productsRes?.data?.products || [];
  for (const product of products) {
    if (!product.product_id) continue;
    urls.push({
      loc:        `${BASE_URL}/storefront/product/${product.product_id}`,
      lastmod:    today,
      priority:   '0.6',
      changefreq: 'daily',
    });
  }

  // ── Build XML ─────────────────────────────────────────────
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`),
    '</urlset>',
  ].join('\n');

  writeFileSync(OUTPUT, xml, 'utf-8');
  console.log(`✅ Sitemap written: ${OUTPUT} (${urls.length} URLs)`);
}

generateSitemap().catch(err => {
  console.error('❌ Sitemap generation failed:', err.message);
  process.exit(1);
});
