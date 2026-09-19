// admin/cashback/page.jsx — P14-2
// Create/edit cashback rules with preview.
'use client';
import { useEffect, useState } from 'react';

const CATEGORIES = ['All categories', 'construction', 'paints', 'tiles', 'plumbing', 'electrical', 'tools'];

export default function AdminCashbackPage() {
  const [rules, setRules]   = useState([]);
  const [form, setForm]     = useState({ cashback_pct: 5, max_cashback_paise: 5000, min_order_paise: 20000, category: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  useEffect(() => { loadRules(); }, []);

  async function loadRules() {
    const r = await fetch('/api/backend/admin/cashback-rules', { credentials: 'include' });
    const d = await r.json();
    setRules(d.data?.rules || []);
  }

  async function save() {
    setSaving(true);
    const body = { ...form, category: form.category || null };
    const r = await fetch('/api/backend/admin/cashback-rules', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { setMsg('Rule created!'); loadRules(); }
    else setMsg('Error saving rule');
  }

  async function toggle(rule) {
    await fetch(`/api/backend/admin/cashback-rules/${rule.id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    loadRules();
  }

  async function del(id) {
    if (!confirm('Delete this rule?')) return;
    await fetch(`/api/backend/admin/cashback-rules/${id}`, { method: 'DELETE', credentials: 'include' });
    loadRules();
  }

  const previewEarn = Math.min(form.max_cashback_paise, Math.floor(form.min_order_paise * form.cashback_pct / 100));

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>💰 Cashback Rules</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>Customers earn wallet credits based on these rules</p>

      {/* Create form */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Create New Rule</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Category</span>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value === 'All categories' ? '' : e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Cashback %</span>
            <input type="number" min="1" max="100" value={form.cashback_pct}
              onChange={e => setForm(f => ({ ...f, cashback_pct: +e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Min order (₹)</span>
            <input type="number" value={form.min_order_paise / 100}
              onChange={e => setForm(f => ({ ...f, min_order_paise: +e.target.value * 100 }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Max cashback (₹)</span>
            <input type="number" value={form.max_cashback_paise / 100}
              onChange={e => setForm(f => ({ ...f, max_cashback_paise: +e.target.value * 100 }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
        </div>

        {/* Preview */}
        <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 13, color: '#166534' }}>
          Preview: On a ₹{form.min_order_paise / 100} order in <strong>{form.category || 'all categories'}</strong>, customer earns <strong>₹{previewEarn / 100}</strong> cashback ({form.cashback_pct}%, max ₹{form.max_cashback_paise / 100})
        </div>

        <button onClick={save} disabled={saving} style={{ marginTop: 14, padding: '10px 24px', background: '#f97316', color: '#fff', borderRadius: 10, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          {saving ? 'Saving...' : '+ Create Rule'}
        </button>
        {msg && <span style={{ marginLeft: 12, fontSize: 13, color: '#16a34a' }}>{msg}</span>}
      </div>

      {/* Rules list */}
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Category', '%', 'Min Order', 'Max Cashback', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 14px' }}>{rule.category || 'All'}</td>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: '#16a34a' }}>{rule.cashback_pct}%</td>
                <td style={{ padding: '10px 14px' }}>₹{(rule.min_order_paise || 0) / 100}</td>
                <td style={{ padding: '10px 14px' }}>₹{(rule.max_cashback_paise || 0) / 100}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '2px 10px', borderRadius: 20, background: rule.is_active ? '#f0fdf4' : '#f3f4f6', color: rule.is_active ? '#16a34a' : '#9ca3af', fontWeight: 700, fontSize: 12 }}>
                    {rule.is_active ? 'Active' : 'Paused'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => toggle(rule)} style={{ marginRight: 8, padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                    {rule.is_active ? 'Pause' : 'Activate'}
                  </button>
                  <button onClick={() => del(rule.id)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fff', cursor: 'pointer', color: '#ef4444', fontSize: 12 }}>Delete</button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No cashback rules yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
