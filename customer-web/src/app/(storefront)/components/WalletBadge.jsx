// (storefront)/components/WalletBadge.jsx — P14-1
// Mini wallet balance badge for StorefrontHeader.
// Pulses orange when balance > Rs.0. Clicking opens /wallet.
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function WalletBadge() {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    fetch('/api/backend/customer/wallet/history?limit=1', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.data?.balance) setBalance(d.data.balance); })
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
      animation: 'pulse 2s infinite',
    }}>
      💰 ₹{Math.floor(balance / 100)}
    </Link>
  );
}
