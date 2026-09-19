import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Import marketing CSS (layout would normally do this, but layout.jsx
// is in the (marketing) group and won't run when this file owns the route)
import './(marketing)/marketing.css';

// Marketing page component — rendered directly from app/page.jsx
// so only one file owns the "/" route (avoids Next.js conflict/500)
import MarketingPage from './(marketing)/MarketingPageContent';

// SEO metadata — must be here because app/page.jsx owns "/" not (marketing)/layout.jsx
export const metadata = {
  title:       'TezzNirmaan — Hardware & Building Materials, Delivered in Patna & Muzaffarpur',
  description: 'Order cement, paint, tiles, plumbing, and electrical supplies from local shops in Patna and Muzaffarpur, Bihar. Delivered in 60–90 minutes or same day.',
  keywords:    'hardware delivery Patna, hardware delivery Muzaffarpur, cement delivery Bihar, building materials Bihar, TezzNirmaan',
  openGraph: {
    title:       'TezzNirmaan — Hardware & Construction Delivered in 60 Minutes',
    description: 'Order cement, paint, tiles, electrical fittings and more. Delivered from local shops in Patna & Muzaffarpur within 60–90 minutes.',
    images: [{
      url:    'https://tezznirmaan.in/og-image.png',
      width:  1200,
      height: 630,
      alt:    'TezzNirmaan — Fast Hardware Delivery in Patna & Muzaffarpur',
    }],
    locale: 'en_IN',
    type:   'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'TezzNirmaan — Hardware Delivered in 60 Minutes',
    description: 'Cement, paint, tiles & fittings from local shops in Patna & Muzaffarpur. Quick & Scheduled delivery.',
    images:      ['https://tezznirmaan.in/og-image.png'],
  },
  robots: { index: true, follow: true },
};

export default async function RootPage() {
  return <MarketingPage />;
}
