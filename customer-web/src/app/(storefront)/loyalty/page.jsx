'use client';
// (storefront)/loyalty/page.jsx — P19-5 (C1 fix: correct cookie auth)
// Loyalty stamp card — 5 stamps per free delivery reward.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';

function getToken() {
  if (typeof window === 'undefined') return null;
  // C1: Must use js-cookie 'tn_token' — same as checkout, orders, profile pages
  return Cookies.get('tn_token') || null;
}

export default function LoyaltyPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const token = getToken();

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch('/api/backend/customer/loyalty', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => { setData(json.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (!token) return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: '0 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎁</div>
      <h1 style={{ fontWeight: 800, color: '#1f2937', marginBottom: 8 }}>Loyalty Rewards</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>Sign in to track your stamp card and earn free deliveries!</p>
      <Link href="/auth?redirect=/loyalty" style={{ background: '#f97316', color: '#fff', padding: '12px 32px', borderRadius: 12, fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>Sign In</Link>
    </div>
  );

  if (loading) return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) }}`}</style>
    </div>
  );

  const stamps     = data?.current_cycle || 0;
  const total      = data?.stamps_per_reward || 5;
  const toNext     = data?.stamps_to_next || 5;
  const rewEarned  = data?.rewards_earned || 0;
  const pct        = Math.round((stamps / total) * 100);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 80px', fontFamily: 'system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🎟️</div>
        <h1 style={{ fontWeight: 900, fontSize: 24, color: '#1f2937', margin: 0 }}>Loyalty Stamp Card</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 6 }}>Earn 1 stamp per order · 5 stamps = Free Delivery 🚀</p>
      </div>

      {/* Stamp card */}
      <div style={{ background: 'linear-gradient(135deg,#fff7ed,#ffedd5)', border: '2px solid #fed7aa', borderRadius: 20, padding: '24px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{
              width: 52, height: 52, borderRadius: '50%',
              background: i < stamps ? '#f97316' : '#fff',
              border: i < stamps ? 'none' : '2.5px dashed #fed7aa',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, boxShadow: i < stamps ? '0 4px 12px rgba(249,115,22,.4)' : 'none',
              transition: 'all .3s',
            }}>
              {i < stamps ? '✅' : '○'}
            </div>
          ))}
        </div>
        {/* Progress bar */}
        <div style={{ height: 8, background: '#fed7aa', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#f97316', borderRadius: 8, transition: 'width .6s' }} />
        </div>
        <p style={{ textAlign: 'center', marginTop: 12, fontWeight: 700, fontSize: 14, color: '#9a3412' }}>
          {stamps === 0 ? 'Place your first order to earn your first stamp!' :
           stamps === total ? '🎉 Reward ready! Free delivery on your next order.' :
           `${stamps}/${total} stamps — ${toNext} more for free delivery!`}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Stamps', value: data?.total_stamps || 0, icon: '📮' },
          { label: 'Free Deliveries Earned', value: rewEarned, icon: '🚀' },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{ background: '#fff', border: '1.5px solid #f3f4f6', borderRadius: 14, padding: '16px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 28 }}>{icon}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#f97316' }}>{value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ background: '#f9fafb', borderRadius: 14, padding: '18px 16px', marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#374151', marginBottom: 12 }}>How It Works</div>
        {[
          ['1️⃣', 'Place any order on TezzNirmaan'],
          ['2️⃣', 'Earn 1 stamp when your order is delivered'],
          ['3️⃣', 'Collect 5 stamps → get free delivery on next order!'],
          ['♾️', 'Rewards never expire — keep earning!'],
        ].map(([icon, text]) => (
          <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontSize: 13, color: '#4b5563' }}>{text}</span>
          </div>
        ))}
      </div>

      <Link href="/" style={{ display: 'block', textAlign: 'center', background: '#f97316', color: '#fff', borderRadius: 14, padding: '14px', fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>
        🛒 Shop & Earn Stamps
      </Link>
    </div>
  );
}
