// ─────────────────────────────────────────────────────────────
// (storefront)/layout.jsx — P10-0 (updated from P9-5)
//
// Root layout for the web storefront route group.
// Completely separate from (marketing) and the dashboard layout.
// - Reads tn_city cookie server-side → passes to <CityProvider>
// - Loads Inter font
// - Applies storefront.css (scoped, no conflicts)
// - Exposes <html>/<body> independently (Next.js parallel layouts)
// - Includes CartProvider, CityProvider and StorefrontHeader/Footer
// ─────────────────────────────────────────────────────────────
import { cookies }          from 'next/headers';
import { Inter }            from 'next/font/google';
import Script               from 'next/script';
import './storefront.css';
import StorefrontHeader     from './components/StorefrontHeader';
import StorefrontFooter     from './components/StorefrontFooter';
import CartProvider         from './components/CartProvider';
import CityProvider         from './components/CityProvider';
import { AppInstallBanner }     from './components/AppInstallBanner'; // P10-7
import PushPermissionPrompt      from './components/PushPermissionPrompt'; // P12-8
import PostHogProvider      from './components/PostHogProvider'; // P13-4
import dynamic from 'next/dynamic';
const PWAInstallBanner = dynamic(() => import('./components/PWAInstallBanner'), { ssr: false }); // P16-4



const inter = Inter({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display:  'swap',
});

// P10-7: themeColor must be in `viewport` export (Next.js 14.2+ requirement)
export const viewport = {
  themeColor: '#E8521A',
};

export const metadata = {
  metadataBase: new URL('https://tezznirmaan.in'),
  title: {
    default:  'TezzNirmaan — Hardware & Building Materials Delivered in 60 Min',
    template: '%s | TezzNirmaan',
  },
  description: 'Order cement, paint, tiles, plumbing and electrical supplies from local shops. Delivered in 60-90 minutes across Patna, Muzaffarpur, Bhagalpur & Gaya, Bihar.',
  keywords:    ['hardware delivery Patna', 'cement delivery Bihar', 'building materials Patna', 'TezzNirmaan', 'quick delivery hardware'],
  // P10-7: PWA manifest + Apple PWA meta
  manifest: '/manifest.json',
  appleWebApp: {
    capable:          true,
    statusBarStyle:   'black-translucent',
    title:            'TezzNirmaan',
  },
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


// Server component — reads cookie for city detection (P10-0 Fix 1)
export default async function StorefrontLayout({ children }) {
  const cookieStore = cookies();
  const citySlug = cookieStore.get('tn_city')?.value || 'patna';

  return (
    <html lang="en" className={inter.variable}>
      <body className="sf-body">
        <PostHogProvider>
          <CityProvider initialCity={citySlug}>
            <CartProvider>
              <StorefrontHeader />
              <main>{children}</main>
              <StorefrontFooter />
              {/* P10-7: App install banner — shows only on Android, not in standalone mode */}
              <AppInstallBanner />
              {/* P12-8: Push permission prompt — non-intrusive, shown after login */}
              <PushPermissionPrompt />
              {/* P16-4: PWA install banner — beforeinstallprompt handler */}
              <PWAInstallBanner />

            </CartProvider>
          </CityProvider>
        </PostHogProvider>
        {/* P10-2: Razorpay web checkout SDK — lazyOnload so it doesn't block page render */}
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
