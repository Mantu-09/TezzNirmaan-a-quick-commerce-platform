// ─────────────────────────────────────────────────────────────
// app/robots.ts — P12-9
// ─────────────────────────────────────────────────────────────
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow:  '/',
        disallow: [
          '/admin/',
          '/dashboard/',
          '/api/',
          '/auth/',
          '/checkout',
          '/order-confirmed',
          '/investor-report/',
        ],
      },
    ],
    sitemap: 'https://tezznirmaan.com/sitemap.xml',
    host:    'https://tezznirmaan.com',
  };
}
