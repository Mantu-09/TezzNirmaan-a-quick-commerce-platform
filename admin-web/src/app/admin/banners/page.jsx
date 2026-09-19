// ─────────────────────────────────────────────────────────────
// admin/banners/page.jsx — P12-10
//
// Admin banner management: create, edit order, toggle active,
// schedule start/end dates. Uses 058_banners.sql table.
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';
import { adminApi }            from '../../../lib/api';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:        ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'return=representation',
      ...(opts.headers || {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || JSON.stringify(json));
  return json;
}

const BLANK = { title: '', subtitle: '', image_url: '', link_url: '', cta_text: 'Shop Now', bg_color: '#f97316', display_order: 0, is_active: true, starts_at: '', ends_at: '', city_id: null };

export default function BannersAdmin() {
  const [banners, setBanners]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null); // null | banner | 'new'
  const [form,    setForm]      = useState(BLANK);
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState('');

  const load = () => {
    setLoading(true);
    sbFetch('banners?select=*&order=display_order.asc')
      .then(setBanners)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openNew  = () => { setForm(BLANK); setEditing('new'); setError(''); };
  const openEdit = (b) => { setForm({ ...b, starts_at: b.starts_at?.slice(0,16) || '', ends_at: b.ends_at?.slice(0,16) || '' }); setEditing(b); setError(''); };
  const set      = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        title:         form.title,
        subtitle:      form.subtitle || null,
        image_url:     form.image_url || null,
        link_url:      form.link_url || null,
        cta_text:      form.cta_text || 'Shop Now',
        bg_color:      form.bg_color,
        display_order: Number(form.display_order) || 0,
        is_active:     form.is_active,
        starts_at:     form.starts_at || null,
        ends_at:       form.ends_at   || null,
        city_id:       form.city_id   || null,
      };
      if (editing === 'new') {
        await sbFetch('banners', { method: 'POST', body: JSON.stringify(payload) });
      } else {
        await sbFetch(`banners?id=eq.${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      }
      setEditing(null);
      load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const toggle = async (b) => {
    await sbFetch(`banners?id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !b.is_active }) });
    load();
  };

  const remove = async (b) => {
    if (!confirm(`Delete banner "${b.title}"?`)) return;
    await sbFetch(`banners?id=eq.${b.id}`, { method: 'DELETE' });
    load();
  };

  const inp   = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' };
  const label = { fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase' };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 2 }}>🖼️ Banner Management</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Homepage hero carousel · City-scoped · Scheduled</p>
        </div>
        <button onClick={openNew}
          style={{ padding: '10px 18px', borderRadius: 10, background: '#f97316', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
          + New Banner
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* Edit/Create form */}
      {editing && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>{editing === 'new' ? 'Create Banner' : 'Edit Banner'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={label}>Title *</label>
              <input style={inp} value={form.title} onChange={e => set('title', e.target.value)} placeholder="⚡ 60-Min Delivery" />
            </div>
            <div>
              <label style={label}>Subtitle</label>
              <input style={inp} value={form.subtitle} onChange={e => set('subtitle', e.target.value)} placeholder="Get cement & paint fast" />
            </div>
            <div>
              <label style={label}>Link URL</label>
              <input style={inp} value={form.link_url} onChange={e => set('link_url', e.target.value)} placeholder="/category/construction" />
            </div>
            <div>
              <label style={label}>Image URL (leave blank for gradient)</label>
              <input style={inp} value={form.image_url} onChange={e => set('image_url', e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label style={label}>CTA Text</label>
              <input style={inp} value={form.cta_text} onChange={e => set('cta_text', e.target.value)} placeholder="Shop Now" />
            </div>
            <div>
              <label style={label}>Background Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.bg_color} onChange={e => set('bg_color', e.target.value)} style={{ width: 40, height: 36, borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer' }} />
                <input style={{ ...inp, flex: 1 }} value={form.bg_color} onChange={e => set('bg_color', e.target.value)} />
              </div>
            </div>
            <div>
              <label style={label}>Display Order</label>
              <input style={inp} type="number" value={form.display_order} onChange={e => set('display_order', e.target.value)} min={0} />
            </div>
            <div>
              <label style={label}>Active</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
                <span style={{ fontSize: 13 }}>{form.is_active ? 'Visible on storefront' : 'Hidden'}</span>
              </label>
            </div>
            <div>
              <label style={label}>Show From (optional)</label>
              <input style={inp} type="datetime-local" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} />
            </div>
            <div>
              <label style={label}>Show Until (optional)</label>
              <input style={inp} type="datetime-local" value={form.ends_at} onChange={e => set('ends_at', e.target.value)} />
            </div>
          </div>

          {/* Preview */}
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <label style={label}>Preview</label>
            <div style={{ height: 100, borderRadius: 12, background: form.image_url ? `url(${form.image_url}) center/cover` : `linear-gradient(135deg,${form.bg_color},${form.bg_color}aa)`, display: 'flex', alignItems: 'flex-end', padding: '14px 18px', position: 'relative' }}>
              {form.image_url && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.5),transparent)', borderRadius: 12 }} />}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontWeight: 900, color: '#fff', fontSize: 16 }}>{form.title || 'Banner Title'}</div>
                {form.subtitle && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>{form.subtitle}</div>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '10px 20px', borderRadius: 10, background: '#f97316', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving…' : editing === 'new' ? 'Create Banner' : 'Save Changes'}
            </button>
            <button onClick={() => setEditing(null)}
              style={{ padding: '10px 16px', borderRadius: 10, background: '#f9fafb', border: '1px solid #e5e7eb', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Banner list */}
      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>
      ) : banners.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: 20, textAlign: 'center', border: '2px dashed #e5e7eb', borderRadius: 12 }}>
          No banners yet. Click "New Banner" to create one.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {banners.map(b => (
            <div key={b.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Mini preview */}
              <div style={{ width: 80, height: 48, borderRadius: 8, flexShrink: 0, background: b.image_url ? `url(${b.image_url}) center/cover` : `linear-gradient(135deg,${b.bg_color},${b.bg_color}aa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 10, textAlign: 'center', padding: 4 }}>
                {!b.image_url && b.title?.slice(0, 12)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  Order: {b.display_order} · {b.link_url || 'No link'}
                  {b.starts_at && ` · From: ${new Date(b.starts_at).toLocaleDateString('en-IN')}`}
                  {b.ends_at   && ` · Until: ${new Date(b.ends_at).toLocaleDateString('en-IN')}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: b.is_active ? '#dcfce7' : '#f3f4f6', color: b.is_active ? '#166534' : '#6b7280' }}>
                  {b.is_active ? 'Live' : 'Hidden'}
                </span>
                <button onClick={() => toggle(b)} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #e5e7eb', background: 'none', cursor: 'pointer' }}>
                  {b.is_active ? 'Hide' : 'Show'}
                </button>
                <button onClick={() => openEdit(b)} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #e5e7eb', background: 'none', cursor: 'pointer' }}>✏️ Edit</button>
                <button onClick={() => remove(b)} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer' }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
