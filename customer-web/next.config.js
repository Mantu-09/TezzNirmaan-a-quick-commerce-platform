/** @type {import('next').NextConfig} */
// P11-4: Wrapped with @ducanh2912/next-pwa for service worker + offline support.
// Uses CommonJS require() because next.config.js uses module.exports (not ESM).
// SW disabled in development to avoid caching stale assets during dev.
const withPWA = require('@ducanh2912/next-pwa').default;

const pwaConfig = withPWA({
  dest: 'public',          // sw.js written to /public
  register: true,          // Auto-registers sw.js in _document
  skipWaiting: true,       // New SW activates immediately on update
  disable: process.env.NODE_ENV === 'development', // No SW in dev
  fallbacks: {
    document: '/offline',  // Served when navigation fetch fails offline
  },
  workboxOptions: {
    runtimeCaching: [
      {
        // L5 fix: checkout, cart, orders MUST be network-only — stale cache causes wrong totals, delivery fees
        urlPattern: /^\/(checkout|cart|orders|order-confirmed)/,
        handler: 'NetworkOnly',
      },
      {
        // Cache storefront browse pages — stale-while-revalidate for fast loads
        urlPattern: /^\/(category|product|track|auth|city|search)/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'storefront-pages',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        // Cache product images from CDN — long-lived, cache-first
        urlPattern: /^https:\/\/images\.tezznirmaan\.in\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'product-images',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
      {
        // Network-first for API calls — always try fresh, stale fallback if offline
        urlPattern: /\/api\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 5 * 60, // 5 min stale fallback
          },
        },
      },
    ],
  },
});

const nextConfig = {
  // P13-1: Leaflet needs transpilePackages for Next.js App Router compatibility
  transpilePackages: ['leaflet'],
  // Skip linting and TS type-checking during build (pure JS project, no tsconfig)
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Allow dashboard to call the Express backend on different origin
  async rewrites() {
    return [
      {
        source:      '/api/backend/:path*',
        destination: `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/v1/:path*`,
      },
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],   // P16-9: serve avif/webp for 40-60% size savings
    minimumCacheTTL: 86400,                   // P16-9: cache optimised images for 24h
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'via.placeholder.com' },
      { protocol: 'https', hostname: 'images.tezznirmaan.in' }, // P9-5: storefront product images
    ],
  },
  // P13-3: Expose Google Maps key to browser
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '',
    NEXT_PUBLIC_POSTHOG_KEY:     process.env.NEXT_PUBLIC_POSTHOG_KEY     || '',
    NEXT_PUBLIC_POSTHOG_HOST:    process.env.NEXT_PUBLIC_POSTHOG_HOST    || 'https://app.posthog.com',
  },
};

module.exports = pwaConfig(nextConfig);
