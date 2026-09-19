// (storefront)/components/ReferralBanner.jsx — P14-3
// Homepage banner: "Refer a friend, earn Rs.100"
// Shown to logged-in users. Dismissible via localStorage.
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ReferralBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('ref_banner_dismissed');
    if (!dismissed) setShow(true);
  }, []);

  function dismiss() {
    localStorage.setItem('ref_banner_dismissed', '1');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)',
      border: '1.5px solid #fed7aa', borderRadius: 14,
      padding: '14px 18px', margin: '12px 0',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28 }}>🎁</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e' }}>Refer a friend → Earn ₹100</div>
          <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>Your friend gets ₹50 off their first order too!</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href="/referral" style={{
          background: '#f97316', color: '#fff', padding: '7px 16px',
          borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}>
          Share now
        </Link>
        <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, padding: '0 4px' }}>✕</button>
      </div>
    </div>
  );
}
