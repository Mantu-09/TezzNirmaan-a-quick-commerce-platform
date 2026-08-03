// ─────────────────────────────────────────────────────────────
// (storefront)/layout.jsx — P9-5
//
// Root layout for the web storefront route group.
// Completely separate from (marketing) and the dashboard layout.
// - Loads Inter font
// - Applies storefront.css (scoped, no conflicts)
// - Exposes <html>/<body> independently (Next.js parallel layouts)
// - Includes CartProvider and StorefrontHeader/Footer
// ─────────────────────────────────────────────────────────────
import { Inter } from 'next/font/google';
import './storefront.css';
import StorefrontHeader from './components/StorefrontHeader';
import StorefrontFooter from './components/StorefrontFooter';
import CartProvider     from './components/CartProvider';

const inter = Inter({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display:  'swap',
});

export const metadata = {
  metadataBase: new URL('https://tezznirmaan.in'),
  title: {
    default:  'TezzNirmaan — Hardware & Building Materials Delivered in 60 Min',
    template: '%s | TezzNirmaan',
  },
  description: 'Order cement, paint, tiles, plumbing and electrical supplies from local shops. Delivered in 60-90 minutes across Patna, Muzaffarpur, Bhagalpur & Gaya, Bihar.',
  keywords:    ['hardware delivery Patna', 'cement delivery Bihar', 'building materials Patna', 'TezzNirmaan', 'quick delivery hardware'],
  openGraph: {
    siteName:    'TezzNirmaan',
    type:        'website',
    locale:      'en_IN',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'TezzNirmaan' }],
  },
  twitter: { card: 'summary_large_image' },
  robots:  { index: true, follow: true },
  alternates: { canonical: 'https://tezznirmaan.in' },
};

export default function StorefrontLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="sf-body">
        <CartProvider>
          <StorefrontHeader />
          <main>{children}</main>
          <StorefrontFooter />
        </CartProvider>
      </body>
    </html>
  );
}
