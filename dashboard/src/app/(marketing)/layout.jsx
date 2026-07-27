// Marketing route group layout — P3-A
// Completely separate from the dashboard (auth) layout.
// No sidebar, no header, no Providers (no Supabase/React-Query
// needed for the public marketing page).
import { Syne, Inter, JetBrains_Mono } from 'next/font/google';
import './marketing.css';

const syne = Syne({
  subsets:  ['latin'],
  weight:   ['700', '800'],
  variable: '--font-syne',
  display:  'swap',
});

const inter = Inter({
  subsets:  ['latin'],
  weight:   ['400', '500', '600'],
  variable: '--font-inter',
  display:  'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets:  ['latin'],
  weight:   ['500', '700'],
  variable: '--font-mono',
  display:  'swap',
});

export const metadata = {
  title:       'TezzNirmaan — Hardware & Building Materials, Delivered in Patna, Muzaffarpur & Bhagalpur',
  description: 'Order cement, paint, tiles, plumbing, and electrical supplies from local shops in Patna, Muzaffarpur and Bhagalpur, Bihar. Delivered in 60–90 minutes or same day.',
  keywords:    'hardware delivery Patna, hardware delivery Muzaffarpur, hardware delivery Bhagalpur, cement delivery Bihar, building materials Bihar, TezzNirmaan',
  openGraph: {
    title:       'TezzNirmaan — Hardware & Construction Delivered in 60 Minutes',
    description: 'Order cement, paint, tiles, electrical fittings and more. Delivered from local shops in Patna, Muzaffarpur & Bhagalpur, Bihar within 60–90 minutes.',
    images: [{
      url:    'https://tezznirmaan.in/og-image.png',
      width:  1200,
      height: 630,
      alt:    'TezzNirmaan — Fast Hardware Delivery in Patna, Muzaffarpur & Bhagalpur, Bihar',
    }],
    locale: 'en_IN',
    type:   'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'TezzNirmaan — Hardware Delivered in 60 Minutes',
    description: 'Cement, paint, tiles & fittings from local shops in Patna, Muzaffarpur & Bhagalpur, Bihar. Quick & Scheduled delivery.',
    images:      ['https://tezznirmaan.in/og-image.png'],
  },
  robots: {
    index:  true,
    follow: true,
  },
};

export default function MarketingLayout({ children }) {
  const fontClasses = `${syne.variable} ${inter.variable} ${jetbrainsMono.variable}`;
  return (
    <html lang="en">
      <body className={fontClasses}>
        {children}
      </body>
    </html>
  );
}
