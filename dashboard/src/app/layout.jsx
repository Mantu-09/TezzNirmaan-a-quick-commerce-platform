import { Inter } from 'next/font/google';
import '../styles/globals.css';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata = {
  title:       'TezzNirmaan — Shop Dashboard',
  description: 'Order management and inventory dashboard for TezzNirmaan shop owners',
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
