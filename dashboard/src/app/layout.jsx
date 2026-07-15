import { Inter } from 'next/font/google';
import '../styles/globals.css';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata = {
  title:       'TezzNirmaan — Shop Dashboard',
  description: 'Order management and inventory dashboard for TezzNirmaan shop owners',
  // B7: Block all search engine indexing — this is an internal operations tool
  robots: {
    index:  false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  // B7: Prevent the dashboard from being embedded in iframes (clickjacking protection)
  other: {
    'X-Frame-Options': 'DENY',
  },
};


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
