// (storefront)/components/WalletBadge.jsx — P14-1
// Mini wallet balance badge for StorefrontHeader.
// Pulses orange when balance > Rs.0. Clicking opens /wallet.
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';

export default function WalletBadge() {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    const token = Cookies.get('tn_token');
    if (!token) return; // Not logged in — hide badge
    fetch('/api/backend/customer/wallet/history?limit=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.data) {
          // backend may return balance_paise or balance (both in paise)
          const bal = d.data.balance_paise ?? d.data.balance ?? 0;
          if (bal > 0) setBalance(bal);
        }
      })
      .catch(() => {});
  }, []);

  if (!balance || balance <= 0) return null;

  return (
    <Link href="/wallet" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: '#fff7ed', border: '1.5px solid #f97316',
      borderRadius: 20, padding: '3px 10px',
      fontSize: 13, fontWeight: 700, color: '#ea580c',
      textDecoration: 'none',
      animation: 'sf-track-pulse 2s ease-in-out infinite',
    }}>
      💰 ₹{Math.floor(balance / 100)}
    </Link>
  );
}

