'use client';
// (storefront)/b2b/emi/page.jsx — P16-7
// B2B contractor EMI plans viewer with UPI autopay mandate setup.
import { useEffect, useState } from 'react';
import Link from 'next/link';

const fmt = p => p != null ? `₹${Math.round(p / 100).toLocaleString('en-IN')}` : '—';
const STATUS_COLOR = { active: '#22c55e', completed: '#3b82f6', defaulted: '#ef4444' };

function EMICard({ plan, onSetupAutopay }) {
  const total    = plan.installments;
  const paid     = plan.paid_count || 0;
  const progress = Math.round((paid / total) * 100);

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 20, marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1f2937' }}>
            {fmt(plan.total_paise)} — {total} Monthly Installments
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
            {fmt(plan.per_emi_paise)} / month &nbsp;·&nbsp; Next due: {plan.next_due_date || '—'}
          </div>
        </div>
        <span style={{ padding: '3px 12px', borderRadius: 20, background: `${STATUS_COLOR[plan.status]}20`, color: STATUS_COLOR[plan.status], fontWeight: 700, fontSize: 12 }}>
          {plan.status}
        </span>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
          <span>{paid} of {total} paid</span>
          <span>{progress}%</span>
        </div>
        <div style={{ background: '#f3f4f6', borderRadius: 8, height: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)', borderRadius: 8, transition: 'width .4s' }} />
        </div>
      </div>

      {/* Schedule */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6, marginBottom: 14 }}>
        {(plan.payments || []).map((pmt, i) => (
          <div key={pmt.id} style={{ background: pmt.status === 'paid' ? '#f0fdf4' : pmt.status === 'overdue' ? '#fff1f2' : '#f9fafb', borderRadius: 8, padding: '6px 10px', fontSize: 12, border: `1px solid ${pmt.status === 'paid' ? '#bbf7d0' : pmt.status === 'overdue' ? '#fecaca' : '#e5e7eb'}` }}>
            <div style={{ fontWeight: 700, color: pmt.status === 'paid' ? '#16a34a' : pmt.status === 'overdue' ? '#ef4444' : '#374151' }}>
              {pmt.status === 'paid' ? '✅' : pmt.status === 'overdue' ? '⚠️' : `#${i + 1}`} {fmt(pmt.amount_paise)}
            </div>
            <div style={{ color: '#9ca3af', marginTop: 1 }}>{pmt.due_date}</div>
          </div>
        ))}
      </div>

      {/* Autopay setup */}
      {plan.status === 'active' && !plan.razorpay_subscription_id && (
        <button onClick={() => onSetupAutopay(plan.id)} style={{ padding: '9px 18px', background: '#1f2937', color: '#fff', borderRadius: 9, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          ⚡ Setup UPI Autopay
        </button>
      )}
      {plan.razorpay_subscription_id && (
        <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✅ UPI Autopay active — installments auto-collected</div>
      )}
    </div>
  );
}

export default function B2BEMIPage() {
  const [plans, setPlans]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [msg, setMsg]           = useState('');

  useEffect(() => { loadPlans(); }, []);

  async function loadPlans() {
    const r = await fetch('/api/backend/customer/b2b/emi-plans', { credentials: 'include' });
    const d = await r.json();
    setPlans(d.data?.plans || []);
    setLoading(false);
  }

  async function setupAutopay(planId) {
    setMsg('Setting up UPI autopay...');
    const r = await fetch('/api/backend/payments/subscriptions/create', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emi_plan_id: planId }),
    });
    const d = await r.json();
    if (r.ok) {
      if (d.data?.shortUrl) {
        window.open(d.data.shortUrl, '_blank');
        setMsg('✅ Approve the mandate in the new tab to activate autopay');
      } else {
        setMsg('✅ Autopay setup initiated (use live Razorpay keys in production)');
      }
      loadPlans();
    } else {
      setMsg('❌ ' + (d.message || 'Error setting up autopay'));
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Link href="/b2b" style={{ color: '#f97316', textDecoration: 'none', fontSize: 22 }}>←</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>💳 My EMI Plans</h1>
      </div>

      {msg && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: msg.startsWith('✅') ? '#f0fdf4' : msg.startsWith('❌') ? '#fff1f2' : '#eff6ff', fontSize: 13, color: msg.startsWith('✅') ? '#16a34a' : msg.startsWith('❌') ? '#ef4444' : '#3b82f6', fontWeight: 600 }}>{msg}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
      ) : plans.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 36, textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1f2937', marginBottom: 8 }}>No EMI plans yet</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>Place a large B2B order and select EMI at checkout</div>
          <Link href="/" style={{ display: 'inline-block', background: '#f97316', color: '#fff', padding: '10px 22px', borderRadius: 10, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>Browse Products</Link>
        </div>
      ) : (
        plans.map(plan => <EMICard key={plan.id} plan={plan} onSetupAutopay={setupAutopay} />)
      )}
    </div>
  );
}
