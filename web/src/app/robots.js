// ─────────────────────────────────────────────────────────────
// web/src/app/robots.js — Robots.txt
// P9-5: TezzNirmaan web storefront
// ─────────────────────────────────────────────────────────────
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow:     '/',
        disallow:  ['/api/', '/_next/', '/.next/'],
      },
    ],
    sitemap: 'https://tezznirmaan.in/sitemap.xml',
    host:    'https://tezznirmaan.in',
  };
}
