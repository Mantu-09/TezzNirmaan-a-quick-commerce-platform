// admin/nudges/page.jsx — P14-8
// Configure reorder reminder nudge rules.
'use client';
import { useEffect, useState } from 'react';

const CATEGORIES = ['', 'construction', 'paints', 'tiles', 'plumbing', 'electrical', 'tools'];

export default function AdminNudgesPage() {
  const [rules, setRules]   = useState([]);
  const [form, setForm]     = useState({ category: '', days_after_order: 7, message_template: 'reorder_generic' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadRules(); }, []);

  async function loadRules() {
    const r = await fetch('/api/backend/admin/nudges', { credentials: 'include' });
    const d = await r.json();
    setRules(d.data?.rules || []);
  }

  async function save() {
    setSaving(true);
    await fetch('/api/backend/admin/nudges', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false);
    loadRules();
  }

  async function toggle(rule) {
    await fetch(`/api/backend/admin/nudges/${rule.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !rule.is_active }) });
    loadRules();
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>⏰ Reorder Nudges</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>Automatically remind customers to reorder based on purchase patterns</p>

      {/* Create form */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Add Nudge Rule</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Category</span>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}>
              <option value="">All categories</option>
              {CATEGORIES.filter(Boolean).map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Days after order</span>
            <input type="number" min="1" max="90" value={form.days_after_order}
              onChange={e => setForm(f => ({ ...f, days_after_order: +e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>WATI template</span>
            <input value={form.message_template} onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }} placeholder="reorder_generic" />
          </label>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff7ed', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
          💡 Preview: Customer who ordered <strong>{form.category || 'any category'}</strong> will receive a nudge after <strong>{form.days_after_order} days</strong> via WhatsApp + Push
        </div>
        <button onClick={save} disabled={saving} style={{ marginTop: 14, padding: '10px 24px', background: '#f97316', color: '#fff', borderRadius: 10, border: 'none', fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Adding...' : '+ Add Rule'}
        </button>
      </div>

      {/* Rules list */}
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Category', 'Send After', 'Template', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 14px' }}>{rule.category || 'All'}</td>
                <td style={{ padding: '10px 14px' }}>{rule.days_after_order} days</td>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{rule.message_template}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '2px 10px', borderRadius: 20, background: rule.is_active ? '#f0fdf4' : '#f3f4f6', color: rule.is_active ? '#16a34a' : '#9ca3af', fontWeight: 700, fontSize: 12 }}>
                    {rule.is_active ? 'Active' : 'Paused'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => toggle(rule)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                    {rule.is_active ? 'Pause' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No nudge rules yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
