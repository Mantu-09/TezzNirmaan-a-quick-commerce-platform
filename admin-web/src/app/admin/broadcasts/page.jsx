'use client';
// admin/broadcasts/page.jsx — P17-7
// WhatsApp broadcast campaign manager.
import { useState, useEffect } from 'react';

const SEGMENTS = [
  { value: 'inactive_7d',      label: 'Inactive 7+ days',   icon: '😴' },
  { value: 'inactive_30d',     label: 'Inactive 30+ days',  icon: '💤' },
  { value: 'high_value',       label: 'High-Value Customers (₹5000+)', icon: '💎' },
  { value: 'b2b_contractors',  label: 'B2B Contractors',    icon: '🏗️' },
  { value: 'city:muzaffarpur', label: 'Muzaffarpur Users',  icon: '📍' },
  { value: 'city:patna',       label: 'Patna Users',        icon: '📍' },
  { value: 'city:bhagalpur',   label: 'Bhagalpur Users',    icon: '📍' },
  { value: 'city:gaya',        label: 'Gaya Users',         icon: '📍' },
  { value: 'all_customers',    label: 'All Customers',      icon: '👥' },
];

const STATUS_COLOR = { pending: '#f97316', sent: '#22c55e', failed: '#ef4444' };

export default function BroadcastsPage() {
  const [templates, setTemplates] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [segment, setSegment]     = useState('inactive_7d');
  const [template, setTemplate]   = useState('');
  const [params, setParams]       = useState({});
  const [reach, setReach]         = useState(null);
  const [sending, setSending]     = useState(false);
  const [msg, setMsg]             = useState('');
  const [tab, setTab]             = useState('compose');

  useEffect(() => { loadTemplates(); loadHistory(); }, []);

  async function loadTemplates() {
    const r = await fetch('/api/backend/admin/broadcasts/templates', { credentials: 'include' });
    const d = await r.json();
    const tmpl = d.data?.templates || {};
    setTemplates(tmpl);
    if (Object.keys(tmpl).length) setTemplate(Object.keys(tmpl)[0]);
  }

  async function loadHistory() {
    const r = await fetch('/api/backend/admin/broadcasts/history', { credentials: 'include' });
    const d = await r.json();
    setCampaigns(d.data?.campaigns || []);
  }

  async function fetchReach() {
    setReach(null);
    const r = await fetch(`/api/backend/admin/broadcasts/reach?segment=${segment}`, { credentials: 'include' });
    const d = await r.json();
    setReach(d.data?.reach ?? 0);
  }

  useEffect(() => { fetchReach(); }, [segment]);

  async function sendCampaign() {
    if (!template || !segment) return;
    if (!window.confirm(`Send "${templates[template]?.label}" to ${reach} contacts?`)) return;
    setSending(true);
    setMsg('');
    const r = await fetch('/api/backend/admin/broadcasts/whatsapp', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_name: templates[template]?.name, segment, params }),
    });
    const d = await r.json();
    setSending(false);
    if (r.ok) {
      setMsg(`✅ Campaign sent! ${d.data?.sent || 0} delivered, ${d.data?.failed || 0} failed`);
      loadHistory();
    } else {
      setMsg('❌ ' + (d.message || 'Error sending campaign'));
    }
  }

  const selectedTmpl = templates[template];
  const previewText  = selectedTmpl?.preview || '';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📢 WhatsApp Broadcasts</h1>
          <p style={{ color: '#9ca3af', margin: '4px 0 0', fontSize: 13 }}>Send marketing messages via WATI.io</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['compose', 'history'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: tab === t ? '#f97316' : '#f3f4f6', color: tab === t ? '#fff' : '#374151', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {t === 'compose' ? '✏️ Compose' : '📋 History'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Left: Config */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>1. Select Audience</h3>
              <select value={segment} onChange={e => setSegment(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14 }}>
                {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
              </select>
              {reach !== null && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#16a34a', fontWeight: 700 }}>
                  📊 Estimated reach: {reach} contacts
                </div>
              )}
            </div>

            <div style={{ background: '#fff', borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>2. Select Template</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(templates).map(([key, tmpl]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${template === key ? '#f97316' : '#e5e7eb'}`, cursor: 'pointer', background: template === key ? '#fff7ed' : '#fff' }}>
                    <input type="radio" name="template" checked={template === key} onChange={() => { setTemplate(key); setParams({}); }} style={{ accentColor: '#f97316' }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1f2937' }}>{tmpl.label}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Params: {tmpl.params?.join(', ')}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Template params */}
            {selectedTmpl?.params?.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>3. Fill Parameters</h3>
                {selectedTmpl.params.map(param => (
                  <label key={param} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{param.replace(/_/g, ' ')}</span>
                    <input value={params[param] || ''} onChange={e => setParams(p => ({ ...p, [param]: e.target.value }))} placeholder={`Enter ${param}`} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }} />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Right: Preview + Send */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f9fafb', borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Preview</h3>
              <div style={{ background: '#e7ffd9', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: '#1f2937', lineHeight: 1.6, minHeight: 80 }}>
                {previewText || 'Select a template to preview'}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#9ca3af' }}>
                Template must be pre-approved in WATI dashboard before sending.
              </div>
            </div>

            {msg && <div style={{ padding: '10px 14px', borderRadius: 10, background: msg.startsWith('✅') ? '#f0fdf4' : '#fff1f2', fontSize: 13, color: msg.startsWith('✅') ? '#16a34a' : '#ef4444', fontWeight: 600 }}>{msg}</div>}

            <button onClick={sendCampaign} disabled={sending || !template || !segment || reach === 0} style={{ padding: '14px', background: sending ? '#d1d5db' : '#f97316', color: '#fff', borderRadius: 12, border: 'none', fontWeight: 800, cursor: sending ? 'default' : 'pointer', fontSize: 15 }}>
              {sending ? 'Sending...' : `📤 Send to ${reach ?? '?'} contacts`}
            </button>

            <div style={{ background: '#fff', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>⚠️ Before sending:</div>
              <ul style={{ fontSize: 12, color: '#6b7280', margin: 0, paddingLeft: 16, lineHeight: 2 }}>
                <li>Template must be WATI-approved</li>
                <li>Add WATI_API_URL + WATI_API_TOKEN to .env</li>
                <li>Users must have opted in to WhatsApp messages</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>{['Template', 'Segment', 'Reach', 'Sent', 'Failed', 'Status', 'Date'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No campaigns yet</td></tr>
              ) : campaigns.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{c.template_name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>{c.segment}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{c.estimated_reach}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#16a34a', fontWeight: 700 }}>{c.sent_count}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#ef4444' }}>{c.failed_count}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, background: `${STATUS_COLOR[c.status]}20`, color: STATUS_COLOR[c.status], fontSize: 12, fontWeight: 700 }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
