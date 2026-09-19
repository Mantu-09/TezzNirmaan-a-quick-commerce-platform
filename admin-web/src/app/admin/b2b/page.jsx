// admin/b2b/page.jsx — P15-1 + P15-3 Enhanced
// Tabs: Contractors (with credit management) | Quote Requests
'use client';
import { useEffect, useState } from 'react';

const fmt = p => p != null ? `₹${Math.round(p / 100).toLocaleString('en-IN')}` : '—';
const STATUS_COLOR = { pending: '#f97316', quoted: '#3b82f6', accepted: '#16a34a', rejected: '#ef4444', expired: '#9ca3af' };

// ── Contractors Tab ──────────────────────────────────────────
function ContractorsTab() {
  const [contractors, setContractors] = useState([]);
  const [selected, setSelected]       = useState(null);
  const [creditForm, setCreditForm]   = useState({ credit_limit_paise: 0, payment_terms_days: 30, discount_percent: 0 });
  const [payForm, setPayForm]         = useState(0);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState('');

  useEffect(() => { loadContractors(); }, []);

  async function loadContractors() {
    const r = await fetch('/api/backend/admin/b2b/contractors', { credentials: 'include' });
    const d = await r.json();
    setContractors(d.data?.contractors || []);
  }

  function selectContractor(c) {
    setSelected(c);
    setCreditForm({ credit_limit_paise: c.credit_limit_paise, payment_terms_days: c.payment_terms_days, discount_percent: c.discount_percent });
    setPayForm(0); setMsg('');
  }

  async function saveCredit() {
    setSaving(true);
    const r = await fetch(`/api/backend/admin/b2b/contractors/${selected.id}/credit`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creditForm, credit_limit_paise: creditForm.credit_limit_paise * 100 }),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok) { setMsg('✅ Credit updated'); loadContractors(); }
    else setMsg('❌ Error');
  }

  async function recordPayment() {
    if (!payForm) return;
    const r = await fetch(`/api/backend/admin/b2b/contractors/${selected.id}/record-payment`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_paise: payForm * 100 }),
    });
    const d = await r.json();
    if (r.ok) { setMsg('✅ ' + d.message); loadContractors(); setPayForm(0); }
    else setMsg('❌ Error');
  }

  const overdue = contractors.filter(c => c.outstanding_credit_paise > c.credit_limit_paise * 0.9);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
      {/* Left: List */}
      <div>
        {overdue.length > 0 && (
          <div style={{ background: '#fff1f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
            ⚠️ {overdue.length} contractor(s) near/over credit limit
          </div>
        )}
        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden' }}>
          {contractors.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No B2B contractors yet</div>
          ) : contractors.map(c => {
            const usedPct = c.credit_limit_paise > 0 ? Math.min(100, Math.round(c.outstanding_credit_paise / c.credit_limit_paise * 100)) : 0;
            const barColor = usedPct >= 90 ? '#ef4444' : usedPct >= 70 ? '#f97316' : '#22c55e';
            return (
              <div key={c.id} onClick={() => selectContractor(c)}
                style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: selected?.id === c.id ? '#fff7ed' : '#fff', transition: 'background .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.company_name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{c.user?.phone} · {c.gst_number || 'No GST'}</div>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: c.is_verified ? '#f0fdf4' : '#fff7ed', color: c.is_verified ? '#16a34a' : '#f97316', fontWeight: 700 }}>
                    {c.is_verified ? 'Verified' : 'Pending'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
                  Outstanding: {fmt(c.outstanding_credit_paise)} / {fmt(c.credit_limit_paise)} limit
                </div>
                <div style={{ height: 5, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${usedPct}%`, background: barColor, borderRadius: 4, transition: 'width .4s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Detail panel */}
      {selected ? (
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, height: 'fit-content' }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, margin: '0 0 14px' }}>{selected.company_name}</h3>

          {/* Credit limit form */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>Credit Settings</div>
            {[
              { label: 'Credit Limit (₹)', key: 'credit_limit_paise', type: 'number' },
              { label: 'Payment Terms (days)', key: 'payment_terms_days', type: 'number' },
              { label: 'B2B Discount %', key: 'discount_percent', type: 'number' },
            ].map(f => (
              <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{f.label}</span>
                <input type={f.type} value={creditForm[f.key]} onChange={e => setCreditForm(p => ({ ...p, [f.key]: +e.target.value }))}
                  style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }} />
              </label>
            ))}
            <button onClick={saveCredit} disabled={saving} style={{ padding: '8px 20px', background: '#1f2937', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {saving ? 'Saving...' : 'Save Credit Settings'}
            </button>
          </div>

          {/* Record payment */}
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>Record Payment Received</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" value={payForm} onChange={e => setPayForm(+e.target.value)}
                placeholder="Amount (₹)"
                style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }} />
              <button onClick={recordPayment} style={{ padding: '7px 14px', background: '#16a34a', color: '#fff', borderRadius: 7, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Record</button>
            </div>
          </div>
          {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith('✅') ? '#16a34a' : '#ef4444' }}>{msg}</div>}
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Select a contractor to manage</div>
      )}
    </div>
  );
}

// ── Quotes Tab ───────────────────────────────────────────────
function QuotesTab() {
  const [quotes, setQuotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [forms, setForms]     = useState({});
  const [msgs, setMsgs]       = useState({});

  useEffect(() => { loadQuotes(); }, []);

  async function loadQuotes() {
    setLoading(true);
    const r = await fetch('/api/backend/admin/b2b/quotes?status=pending', { credentials: 'include' });
    const d = await r.json();
    setQuotes(d.data?.quotes || []);
    setLoading(false);
  }

  async function action(id, act) {
    const form = forms[id] || {};
    const r = await fetch(`/api/backend/admin/b2b/quotes/${id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act, quoted_total_paise: (form.total || 0) * 100, discount_pct: form.discount || 0, rejection_reason: form.reason }),
    });
    const d = await r.json();
    setMsgs(p => ({ ...p, [id]: r.ok ? `✅ ${act === 'approve' ? 'Approved' : 'Rejected'}` : `❌ Error` }));
    if (r.ok) loadQuotes();
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!quotes.length) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No pending quote requests 🎉</div>;

  return (
    <div>
      {quotes.map(q => (
        <div key={q.id} style={{ background: '#fff', borderRadius: 14, padding: 20, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{q.contractor?.company_name}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{new Date(q.created_at).toLocaleString('en-IN')}</div>
            </div>
            <span style={{ padding: '3px 12px', borderRadius: 20, background: `${STATUS_COLOR[q.status]}20`, color: STATUS_COLOR[q.status], fontWeight: 700, fontSize: 12 }}>{q.status}</span>
          </div>

          {/* Items */}
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
            {(q.items || []).map((item, i) => (
              <div key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>• {item.qty} {item.unit} of <strong>{item.name}</strong></div>
            ))}
          </div>

          {q.admin_notes && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Notes: {q.admin_notes}</div>}

          {/* Approve form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center' }}>
            <input type="number" placeholder="Total price (₹)" value={forms[q.id]?.total || ''}
              onChange={e => setForms(p => ({ ...p, [q.id]: { ...p[q.id], total: +e.target.value } }))}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13 }} />
            <input type="number" placeholder="Discount %" value={forms[q.id]?.discount || ''}
              onChange={e => setForms(p => ({ ...p, [q.id]: { ...p[q.id], discount: +e.target.value } }))}
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13 }} />
            <button onClick={() => action(q.id, 'approve')} style={{ padding: '7px 14px', background: '#16a34a', color: '#fff', borderRadius: 7, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>✅ Approve</button>
            <button onClick={() => { const reason = prompt('Rejection reason?'); setForms(p => ({ ...p, [q.id]: { ...p[q.id], reason } })); action(q.id, 'reject'); }}
              style={{ padding: '7px 14px', background: '#ef4444', color: '#fff', borderRadius: 7, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>❌ Reject</button>
          </div>
          {msgs[q.id] && <div style={{ marginTop: 8, fontSize: 13, color: msgs[q.id].startsWith('✅') ? '#16a34a' : '#ef4444' }}>{msgs[q.id]}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function AdminB2BPage() {
  const [tab, setTab] = useState('contractors');
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>🏗️ B2B Management</h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>Manage contractors, credit limits, and quote requests</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[['contractors', '👷 Contractors'], ['quotes', '📋 Quote Requests']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: '8px 18px', borderRadius: 20, border: '1.5px solid', borderColor: tab === key ? '#f97316' : '#e5e7eb', background: tab === key ? '#fff7ed' : '#fff', color: tab === key ? '#ea580c' : '#6b7280', fontWeight: tab === key ? 700 : 500, cursor: 'pointer', fontSize: 14 }}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'contractors' ? <ContractorsTab /> : <QuotesTab />}
    </div>
  );
}
