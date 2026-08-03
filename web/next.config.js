/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Image optimization ──────────────────────────────────────
  // Allow images from our CDN and Supabase storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.tezznirmaan.in',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // ── Redirects ────────────────────────────────────────────────
  async redirects() {
    return [
      // Redirect old /product/:id URLs to the new /shop/:slug/:productId format
      // (for future-proofing if we need to change URL structure)
    ];
  },

  // ── Headers ──────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Security headers for all pages
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'X-Frame-Options',          value: 'DENY' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Allow search engines to cache static shop/product pages for 1 minute
        source: '/shop/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
    ];
  },
};

export default nextConfig;
