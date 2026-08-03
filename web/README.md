# TezzNirmaan Web Storefront

> Next.js 14 (App Router) — public SEO face of TezzNirmaan.

## Purpose

The web storefront is **not** the ordering app — it's the SEO surface.
Customers browse products, check availability, and then download the
TezzNirmaan app to complete their order.

Every page is either statically generated or ISR-revalidated. The entire
site can serve from a CDN edge with **zero server load** for most traffic.

## URL Structure

| URL | Page | Cache |
|-----|------|-------|
| `/` | Homepage | Static (rebuild) |
| `/shop/:slug` | Shop page | ISR 60s |
| `/shop/:slug/:productId` | Product detail | ISR 60s |
| `/order/track/:orderId` | Order tracking | Client-side, no cache |
| `/category/:slug` | Category listing | ISR 3600s |
| `/sitemap.xml` | Sitemap | ISR 24h |
| `/robots.txt` | Robots | Static |

## Environment Variables

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Public API base URL (e.g. `https://api.tezznirmaan.in`) |
| `INTERNAL_API_URL` | Internal API URL (server-to-server, optional — falls back to NEXT_PUBLIC_API_URL) |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console verification code |

## Development

```bash
npm install
npm run dev        # http://localhost:3001
```

## Production build

```bash
npm run build
npm run start
```

## Deployment (Vercel)

1. Connect this `/web` directory to a Vercel project
2. Set environment variables in Vercel dashboard
3. Deploy — Vercel auto-handles ISR and CDN caching

## SEO

- **Sitemap**: auto-generated at `/sitemap.xml` — includes all active shops
- **Robots**: generated at `/robots.txt`
- **Structured data**: Organization (homepage), LocalBusiness (shop pages), Product (product pages)
- **OpenGraph / Twitter Cards**: configured in `layout.jsx`

## Adding new pages

1. Create `src/app/your-page/page.jsx`
2. Export `generateMetadata` for SEO
3. Use `revalidate` for ISR caching
4. Add to `sitemap.js` if it should be indexed
