// ─────────────────────────────────────────────────────────────
// (storefront)/pass/page.jsx — P12-6
//
// TezzNirmaan Pass subscription page.
// Uses existing subscription schema (039_subscription.sql).
// Auth-gated — shows benefits, current plan status, upgrade CTA.
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';
import { useRouter }           from 'next/navigation';
import Link                    from 'next/link';
import Cookies                 from 'js-cookie';

const API = '/api/backend';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

const PLANS = [
  {
    id:       'monthly',
    label:    'Monthly Pass',
    price:    9900,  // ₹99
    duration: '30 days',
    badge:    null,
    benefits: [
      '🚚 FREE delivery on all orders',
      '⚡ Priority delivery queue',
      '💰 5% cashback on every order',
      '🎯 Exclusive member-only deals',
    ],
  },
  {
    id:       'quarterly',
    label:    'Quarterly Pass',
    price:    24900, // ₹249
    duration: '90 days',
    badge:    '🔥 Best Value',
    savings:  '₹48 savings vs monthly',
    benefits: [
      '🚚 FREE delivery on all orders',
      '⚡ Priority delivery queue',
      '💰 7% cashback on every order',
      '🎯 Exclusive member-only deals',
      '📞 Dedicated support line',
    ],
  },
];

export default function PassPage() {
  const router = useRouter();
  const [subscription, setSubscription] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState('quarterly');
  const [activating,   setActivating]   = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    const token = Cookies.get('tn_token');
    if (!token) { router.push('/auth?redirect=/pass'); return; }
    fetch(`${API}/customer/subscription`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => setSubscription(json.data || json.subscription || null))
      .catch(() => {}) // Non-fatal — show plans even without subscription data
      .finally(() => setLoading(false));
  }, [router]);

  const activate = async (planId) => {
    setActivating(true); setError('');
    const token = Cookies.get('tn_token');
    try {
      const plan = PLANS.find(p => p.id === planId);
      const res  = await fetch(`${API}/customer/subscription`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ plan_id: planId, amount_paise: plan.price }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not activate pass');
      setSubscription(json.data || json.subscription);
    } catch (err) {
      setError(err.message);
    } finally {
      setActivating(false);
    }
  };

  const isActive = subscription?.status === 'active';

  if (loading) return (
    <div className="sf-wrap" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--sf-text-2,#9ca3af)' }}>
      Loading…
    </div>
  );

  return (
    <div className="sf-wrap sf-section" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)', marginBottom: 16 }}>
        <Link href="/" style={{ color: 'var(--sf-primary,#f97316)' }}>Home</Link> › TezzNirmaan Pass
      </div>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
        borderRadius: 20, padding: '32px 28px', marginBottom: 28, color: '#fff', textAlign: 'center',
        boxShadow: '0 8px 32px rgba(30,27,75,0.3)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>👑</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>TezzNirmaan Pass</h1>
        <p style={{ opacity: 0.85, fontSize: 15, maxWidth: 400, margin: '0 auto' }}>
          Free delivery. Priority queue. More cashback. Built for serious builders.
        </p>
      </div>

      {/* Active subscription state */}
      {isActive && (
        <div style={{ padding: '20px 24px', borderRadius: 16, background: '#dcfce7', border: '1px solid #86efac', marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#166534', marginBottom: 4 }}>
            ✅ Your Pass is Active!
          </div>
          <div style={{ fontSize: 14, color: '#166534' }}>
            Plan: <strong>{subscription.plan_id}</strong> ·
            Valid until: <strong>{fmtDate(subscription.expires_at)}</strong>
          </div>
          <div style={{ fontSize: 12, color: '#166534', marginTop: 6 }}>
            All Pass benefits are active on your account. Enjoy free delivery & extra cashback!
          </div>
        </div>
      )}

      {/* Plan cards */}
      {!isActive && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>Choose Your Plan</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 24 }}>
            {PLANS.map(plan => (
              <div
                key={plan.id}
                onClick={() => setSelected(plan.id)}
                style={{
                  borderRadius: 16, padding: '20px 22px', cursor: 'pointer',
                  border: `2px solid ${selected === plan.id ? '#6d28d9' : 'var(--sf-border,#e5e7eb)'}`,
                  background: selected === plan.id ? '#f5f3ff' : 'var(--sf-surface,#fff)',
                  transition: 'border-color 0.15s, background 0.15s', position: 'relative',
                }}
              >
                {plan.badge && (
                  <div style={{ position: 'absolute', top: -10, right: 16, padding: '3px 12px', borderRadius: 10, background: '#f97316', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                    {plan.badge}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>{plan.label}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{plan.duration}</div>
                    {plan.savings && <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginTop: 2 }}>{plan.savings}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#312e81' }}>
                      ₹{Math.round(plan.price / 100)}
                    </div>
                  </div>
                </div>
                {plan.benefits.map((b, i) => (
                  <div key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 6, display: 'flex', gap: 6 }}>
                    {b}
                  </div>
                ))}
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${selected === plan.id ? '#6d28d9' : '#d1d5db'}`,
                    background: selected === plan.id ? '#6d28d9' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected === plan.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: selected === plan.id ? '#6d28d9' : '#6b7280' }}>
                    {selected === plan.id ? 'Selected' : 'Select this plan'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {error && <div style={{ padding: '10px 16px', borderRadius: 10, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <button
            onClick={() => activate(selected)}
            disabled={activating}
            style={{
              width: '100%', padding: '16px', borderRadius: 14,
              background: 'linear-gradient(135deg, #6d28d9, #4c1d95)',
              color: '#fff', border: 'none', fontWeight: 900, fontSize: 16,
              cursor: 'pointer', opacity: activating ? 0.7 : 1,
              boxShadow: '0 4px 16px rgba(109,40,217,0.4)',
            }}>
            {activating ? 'Activating…' : `👑 Activate ${PLANS.find(p => p.id === selected)?.label} — ₹${Math.round((PLANS.find(p => p.id === selected)?.price || 0) / 100)}`}
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--sf-text-3,#9ca3af)', marginTop: 10 }}>
            Payment via Razorpay · Instant activation · Cancel anytime
          </p>
        </>
      )}

      {/* Benefits table (always shown) */}
      <div style={{ marginTop: 32, background: 'var(--sf-surface,#fff)', borderRadius: 16, border: '1px solid var(--sf-border,#e5e7eb)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', background: '#1e1b4b', color: '#fff', fontWeight: 800, fontSize: 15 }}>
          Pass Benefits vs Free
        </div>
        {[
          { benefit: 'Delivery fee',        free: '₹49/order',  pass: '🚚 FREE'        },
          { benefit: 'Cashback',            free: '2%',          pass: '5–7%'           },
          { benefit: 'Delivery priority',   free: 'Standard',    pass: '⚡ Priority'    },
          { benefit: 'Member deals',        free: '❌',           pass: '✅ Exclusive'   },
          { benefit: 'Customer support',    free: 'Email only',  pass: '📞 Priority'    },
          { benefit: 'Min order for free delivery', free: '₹499', pass: '🚚 No minimum' },
        ].map((row, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            padding: '12px 20px', borderBottom: '1px solid var(--sf-border,#f3f4f6)',
            background: i % 2 === 0 ? 'var(--sf-bg,#f9fafb)' : 'var(--sf-surface,#fff)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sf-text,#111827)' }}>{row.benefit}</span>
            <span style={{ fontSize: 13, color: 'var(--sf-text-2,#9ca3af)', textAlign: 'center' }}>{row.free}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9', textAlign: 'center' }}>{row.pass}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
