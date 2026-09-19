// ─────────────────────────────────────────────────────────────
// app/sitemap.ts — P12-9
//
// Dynamic XML sitemap for Next.js App Router.
// Auto-submitted to Google Search Console via ISR.
//
// Includes:
//   • Static pages (/, /about, /contact, /pass, /b2b, city pages)
//   • All active categories × all cities
//   • Dynamic product pages (top 200 from catalog)
//   • Storefront city pages
//
// Revalidates every 12 hours (ISR).
// ─────────────────────────────────────────────────────────────
import { MetadataRoute } from 'next';

const BASE_URL = 'https://tezznirmaan.com';
const API      = process.env.API_BASE_URL || 'http://localhost:3000';

const CITIES = ['patna', 'muzaffarpur', 'bhagalpur', 'gaya'];
const CATEGORIES = [
  'construction', 'paints', 'tiles', 'electrical',
  'plumbing', 'hardware', 'decor', 'fittings',
];

export const revalidate = 43200; // 12 hours

async function fetchTopProducts(): Promise<{ id: string; updatedAt?: string }[]> {
  try {
    const res = await fetch(`${API}/api/v1/public/catalog?city=patna&limit=200&sort=popular`, {
      next: { revalidate: 43200 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data?.products || []).map((p: Record<string, string>) => ({
      id:        p.id || p.inventory_id,
      updatedAt: p.updated_at,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await fetchTopProducts();
  const now      = new Date().toISOString();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL,                    lastModified: now, changeFrequency: 'daily',   priority: 1.0  },
    { url: `${BASE_URL}/pass`,          lastModified: now, changeFrequency: 'monthly', priority: 0.7  },
    { url: `${BASE_URL}/b2b`,           lastModified: now, changeFrequency: 'monthly', priority: 0.7  },
    { url: `${BASE_URL}/search`,        lastModified: now, changeFrequency: 'daily',   priority: 0.6  },
  ];

  // City homepages
  const cityPages: MetadataRoute.Sitemap = CITIES.map(city => ({
    url:             `${BASE_URL}/?city=${city}`,
    lastModified:    now,
    changeFrequency: 'daily' as const,
    priority:        0.9,
  }));

  // Category × city
  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.flatMap(cat =>
    CITIES.map(city => ({
      url:             `${BASE_URL}/category/${cat}?city=${city}`,
      lastModified:    now,
      changeFrequency: 'daily'   as const,
      priority:        0.8,
    }))
  );

  // City landing pages
  const cityLandingPages: MetadataRoute.Sitemap = CITIES.map(city => ({
    url:             `${BASE_URL}/city/${city}`,
    lastModified:    now,
    changeFrequency: 'weekly' as const,
    priority:        0.75,
  }));

  // Product pages
  const productPages: MetadataRoute.Sitemap = products.map(p => ({
    url:             `${BASE_URL}/product/${p.id}`,
    lastModified:    p.updatedAt || now,
    changeFrequency: 'weekly' as const,
    priority:        0.6,
  }));

  const BLOG_SLUGS = [
    'how-to-choose-cement-grade-bihar',
    'monsoon-waterproofing-tips-bihar',
    'asian-paints-vs-berger-which-is-better',
    'plumbing-pipe-types-cpvc-upvc-gi',
    'electrical-wire-selection-guide-india',
  ];

  const blogPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/blog`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.7 },
    ...BLOG_SLUGS.map(slug => ({
      url:             `${BASE_URL}/blog/${slug}`,
      lastModified:    now,
      changeFrequency: 'monthly' as const,
      priority:        0.65,
    })),
  ];

  return [
    ...staticPages,
    ...cityPages,
    ...categoryPages,
    ...cityLandingPages,
    ...productPages,
    ...blogPages,
  ];
}
