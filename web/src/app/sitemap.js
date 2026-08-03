// ─────────────────────────────────────────────────────────────
// web/src/app/sitemap.js — Dynamic sitemap
// P9-5: TezzNirmaan web storefront
//
// Generated at request time, ISR-cached for 24 hours.
// Includes: homepage, category pages, all active shop pages.
// ─────────────────────────────────────────────────────────────
import { getAllShopSlugs } from '../lib/api';

const BASE_URL = 'https://tezznirmaan.in';

const CATEGORIES = [
  'cement-concrete', 'paints', 'tiles', 'plumbing',
  'electrical', 'hardware', 'aggregates', 'wood',
];

export const revalidate = 86400; // Rebuild sitemap every 24 hours

export default async function sitemap() {
  const now = new Date();

  // ── Static pages ──────────────────────────────────────────
  const staticRoutes = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/list-your-shop`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/legal/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/legal/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/legal/refund`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // ── Category pages ────────────────────────────────────────
  const categoryRoutes = CATEGORIES.map(slug => ({
    url:             `${BASE_URL}/category/${slug}`,
    lastModified:    now,
    changeFrequency: 'weekly',
    priority:        0.8,
  }));

  // ── Shop pages ────────────────────────────────────────────
  let shopRoutes = [];
  try {
    const slugs = await getAllShopSlugs();
    shopRoutes = slugs.map(slug => ({
      url:             `${BASE_URL}/shop/${slug}`,
      lastModified:    now,
      changeFrequency: 'daily',
      priority:        0.9,
    }));
  } catch (_) {
    // If shop list is unavailable, sitemap omits shop pages
    // but that's non-fatal
  }

  return [...staticRoutes, ...categoryRoutes, ...shopRoutes];
}
