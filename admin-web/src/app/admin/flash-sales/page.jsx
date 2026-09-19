// admin/flash-sales/page.jsx — P13-5
// Admin page to create and manage flash sales.
'use client';
import { useState, useEffect } from 'react';
import Cookies from 'js-cookie';

function getToken() { return Cookies.get('tn_token') || ''; }

const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-IN') : '—';

export default function FlashSalesAdmin() {
  const [sales,     setSales]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [form, setForm] = useState({
    title: '', discount_pct: '', max_discount_paise: '',
    starts_at: '', ends_at: '', category: '', is_active: true,
    // P19-3: Auto-scheduler fields
    scheduled_start: '', scheduled_end: '', auto_managed: false,
  });

  const token = getToken();

  useEffect(() => {
    fetchSales();
  }, []);

  async function fetchSales() {
    setLoading(true);
    try {
      const res  = await fetch('/api/backend/admin/flash-sales', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setSales(json.data?.flash_sales || []);
    } catch { setError('Failed to load flash sales'); }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        discount_pct:       parseInt(form.discount_pct),
        max_discount_paise: form.max_discount_paise ? parseInt(form.max_discount_paise) * 100 : null,
        // P19-3: pass schedule fields (nullify empties)
        scheduled_start: form.scheduled_start || null,
        scheduled_end:   form.scheduled_end   || null,
        auto_managed:    form.auto_managed,
      };
      const res  = await fetch('/api/backend/admin/flash-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:   JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed');
      setShowForm(false);
      fetchSales();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  async function toggleActive(id, current) {
    await fetch(`/api/backend/admin/flash-sales/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ is_active: !current }),
    });
    fetchSales();
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>⚡ Flash Sales</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Create time-limited discount promotions</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '10px 20px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
          {showForm ? '✕ Cancel' : '+ New Flash Sale'}
        </button>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 20 }}>Create Flash Sale</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Title *</label>
              <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Deal of the Hour 🔥" style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} required />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Discount % *</label>
              <input type="number" min="1" max="90" value={form.discount_pct} onChange={e => set('discount_pct', e.target.value)} placeholder="20" style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} required />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Max Discount (₹, optional)</label>
              <input type="number" value={form.max_discount_paise} onChange={e => set('max_discount_paise', e.target.value)} placeholder="200" style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Category (optional)</label>
              <input value={form.category} onChange={e => set('category', e.target.value)} placeholder="paints" style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Starts At *</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} required />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Ends At *</label>
              <input type="datetime-local" value={form.ends_at} onChange={e => set('ends_at', e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} required />
            </div>
          </div>

          {/* P19-3: Auto-Schedule section */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#166534' }}>
              <input type="checkbox" checked={form.auto_managed} onChange={e => set('auto_managed', e.target.checked)} style={{ width: 16, height: 16 }} />
              🤖 Auto-manage (scheduler turns sale on/off automatically)
            </label>
            {form.auto_managed && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, color: '#166534' }}>Auto-Start At</label>
                  <input type="datetime-local" value={form.scheduled_start} onChange={e => set('scheduled_start', e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 12, boxSizing: 'border-box', background: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, color: '#166534' }}>Auto-End At</label>
                  <input type="datetime-local" value={form.scheduled_end} onChange={e => set('scheduled_end', e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 12, boxSizing: 'border-box', background: '#fff' }} />
                </div>
              </div>
            )}
          </div>

          <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Creating…' : 'Create Flash Sale'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div>
      ) : sales.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <p>No flash sales yet. Create one above!</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                {['Title', 'Discount', 'Category', 'Starts', 'Ends', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => (
                <tr key={sale.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{sale.title}</td>
                  <td style={{ padding: '12px 16px', color: '#f97316', fontWeight: 800 }}>{sale.discount_pct}%</td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>{sale.category || 'All'}</td>
                  <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 12 }}>{fmt(sale.starts_at)}</td>
                  <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 12 }}>{fmt(sale.ends_at)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: sale.is_active ? '#dcfce7' : '#fee2e2', color: sale.is_active ? '#166534' : '#dc2626' }}>
                      {sale.is_active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => toggleActive(sale.id, sale.is_active)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 12 }}>
                      {sale.is_active ? 'Pause' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
