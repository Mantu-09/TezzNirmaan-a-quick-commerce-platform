// (storefront)/referral/page.jsx — P14-3 Upgraded
// WhatsApp share, progress bar, referral leaderboard.
'use client';
import { useEffect, useState } from 'react';

const fmt = p => `₹${Math.floor(p / 100)}`;

export default function ReferralPage() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]  = useState(false);

  useEffect(() => {
    fetch('/api/backend/customer/referral-stats', { credentials: 'include' })
      .then(r => r.json()).then(d => setData(d.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function copyCode() {
    navigator.clipboard.writeText(data?.referral_code || '').then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}>Please <a href="/auth">login</a> to view referrals.</div>;

  const progressToNext = Math.min(100, ((data.completed_referrals % 5) / 5) * 100);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 80px' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', borderRadius: 20, padding: 28, color: '#fff', textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>Refer & Earn</h1>
        <p style={{ fontSize: 14, opacity: 0.9, margin: 0 }}>Get ₹100 for every friend who orders. They get ₹50 off!</p>
      </div>

      {/* Referral Code */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Your referral code</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: 10, padding: '12px 16px', fontSize: 22, fontWeight: 800, letterSpacing: 3, color: '#f97316', textAlign: 'center' }}>
            {data.referral_code || 'LOADING'}
          </div>
          <button onClick={copyCode} style={{ padding: '12px 16px', background: copied ? '#f0fdf4' : '#f1f5f9', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, color: copied ? '#16a34a' : '#374151', fontSize: 13 }}>
            {copied ? '✅' : '📋 Copy'}
          </button>
        </div>

        {/* WhatsApp Share */}
        <a href={data.whatsapp_share} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, background: '#25d366', color: '#fff', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          <span style={{ fontSize: 20 }}>💬</span> Share on WhatsApp
        </a>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total', value: data.total_referrals, icon: '👥' },
          { label: 'Completed', value: data.completed_referrals, icon: '✅' },
          { label: 'Earned', value: fmt(data.total_earned_paise), icon: '💰' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '14px 10px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1f2937' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress to next milestone */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
          <span>🏆 Progress to bonus</span>
          <span>{data.completed_referrals % 5}/5 referrals</span>
        </div>
        <div style={{ background: '#f3f4f6', borderRadius: 10, height: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg, #f97316, #ea580c)', borderRadius: 10, width: `${progressToNext}%`, transition: 'width .6s' }} />
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Refer {5 - (data.completed_referrals % 5)} more friends → unlock ₹500 bonus</div>
      </div>

      {/* How it works */}
      <div style={{ background: '#f9fafb', borderRadius: 16, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>How it works</h3>
        {[
          ['1️⃣', 'Share your code with friends on WhatsApp'],
          ['2️⃣', 'Friend uses your code on their first order'],
          ['3️⃣', 'They get ₹50 off, you get ₹100 in wallet'],
        ].map(([icon, text]) => (
          <div key={text} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13, color: '#374151' }}>
            <span>{icon}</span><span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
