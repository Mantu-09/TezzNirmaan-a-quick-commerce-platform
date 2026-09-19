// (storefront)/b2b/quote/page.jsx — P15-1
// B2B contractors submit bulk quantity quote requests.
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const STATUS_COLOR = { pending: '#f97316', quoted: '#3b82f6', accepted: '#16a34a', rejected: '#ef4444', expired: '#9ca3af' };

function QuoteItem({ item, onRemove }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#f9fafb', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{item.name}</div>
      <div style={{ color: '#6b7280', fontSize: 13 }}>{item.qty} {item.unit || 'units'}</div>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>✕</button>
    </div>
  );
}

export default function B2BQuotePage() {
  const [items, setItems]     = useState([]);
  const [form, setForm]       = useState({ name: '', qty: 1, unit: 'bags' });
  const [notes, setNotes]     = useState('');
  const [quotes, setQuotes]   = useState([]);
  const [submitting, setSub]  = useState(false);
  const [msg, setMsg]         = useState('');

  useEffect(() => { loadQuotes(); }, []);

  async function loadQuotes() {
    const r = await fetch('/api/backend/customer/b2b/quotes', { credentials: 'include' });
    const d = await r.json();
    setQuotes(d.data?.quotes || []);
  }

  function addItem() {
    if (!form.name || !form.qty) return;
    setItems(prev => [...prev, { ...form, id: Date.now() }]);
    setForm({ name: '', qty: 1, unit: 'bags' });
  }

  async function submitQuote() {
    if (!items.length) return setMsg('Add at least one item');
    setSub(true);
    const r = await fetch('/api/backend/customer/b2b/quotes', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, notes }),
    });
    const d = await r.json();
    setSub(false);
    if (r.ok) { setMsg('✅ ' + d.message); setItems([]); setNotes(''); loadQuotes(); }
    else setMsg('❌ ' + (d.message || 'Error'));
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Link href="/b2b" style={{ color: '#f97316', textDecoration: 'none', fontSize: 22 }}>←</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📋 Request a Bulk Quote</h1>
      </div>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>Get custom pricing for large orders. We respond within 2 hours during business hours.</p>

      {/* Item builder */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Add Items</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 12 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Product name (e.g. JK Cement 53 Grade)"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }} />
          <input type="number" min="1" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: +e.target.value }))}
            placeholder="Qty"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }} />
          <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}>
            {['bags', 'kg', 'litre', 'drums', 'pieces', 'sq.ft', 'sq.m', 'box'].map(u => <option key={u}>{u}</option>)}
          </select>
          <button onClick={addItem} style={{ padding: '8px 14px', background: '#f97316', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>+ Add</button>
        </div>

        {items.length > 0 ? (
          <div>
            {items.map((item, i) => (
              <QuoteItem key={item.id} item={item} onRemove={() => setItems(prev => prev.filter((_, j) => j !== i))} />
            ))}
          </div>
        ) : (
          <div style={{ padding: '16px 0', color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>No items added yet</div>
        )}

        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Additional notes (delivery site, timeline, special requirements...)"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, marginTop: 12, minHeight: 72, resize: 'vertical', boxSizing: 'border-box' }} />

        <button onClick={submitQuote} disabled={submitting || !items.length}
          style={{ marginTop: 12, padding: '12px 24px', background: submitting ? '#9ca3af' : '#1f2937', color: '#fff', borderRadius: 10, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 14, width: '100%' }}>
          {submitting ? 'Submitting...' : '🚀 Submit Quote Request'}
        </button>
        {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith('✅') ? '#16a34a' : '#ef4444', textAlign: 'center' }}>{msg}</div>}
      </div>

      {/* Past quotes */}
      {quotes.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Past Quote Requests</h2>
          {quotes.map(q => (
            <div key={q.id} style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(q.created_at).toLocaleDateString('en-IN')}</span>
                <span style={{ padding: '2px 10px', borderRadius: 20, background: `${STATUS_COLOR[q.status]}20`, color: STATUS_COLOR[q.status], fontWeight: 700, fontSize: 12 }}>{q.status}</span>
              </div>
              <div style={{ fontSize: 13, color: '#374151' }}>{q.items?.map(i => `${i.qty} ${i.unit} ${i.name}`).join(', ')}</div>
              {q.status === 'quoted' && (
                <div style={{ marginTop: 6, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
                  Quoted Price: ₹{Math.round((q.quoted_total_paise || 0) / 100).toLocaleString('en-IN')}
                  {q.discount_pct > 0 && <span style={{ marginLeft: 8, color: '#16a34a' }}>({q.discount_pct}% off)</span>}
                  <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 8 }}>Valid till {new Date(q.valid_until).toLocaleDateString('en-IN')}</span>
                </div>
              )}
              {q.rejection_reason && <div style={{ marginTop: 4, fontSize: 12, color: '#ef4444' }}>Reason: {q.rejection_reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
