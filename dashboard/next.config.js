/** @type {import('next').NextConfig} */
const nextConfig = {
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
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'via.placeholder.com' },
    ],
  },
};

module.exports = nextConfig;
