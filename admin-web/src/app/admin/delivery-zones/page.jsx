// admin/delivery-zones/page.jsx — P15-6
// Create and manage city delivery zones with surge pricing.
'use client';
import { useEffect, useState } from 'react';

export default function AdminDeliveryZonesPage() {
  const [zones, setZones]   = useState([]);
  const [cities, setCities] = useState([]);
  const [form, setForm]     = useState({ city_id: '', name: '', base_fee_paise: 20, surge_multiplier: 1.0, surge_start_hour: 18, surge_end_hour: 21, max_distance_km: 10, cod_enabled: true, cod_limit_paise: 500 });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    loadZones();
    fetch('/api/backend/public/cities', { credentials: 'include' }).then(r => r.json())
      .then(d => { setCities(d.data?.cities || []); if (d.data?.cities?.[0]) setForm(f => ({ ...f, city_id: d.data.cities[0].id })); }).catch(() => {});
  }, []);

  async function loadZones() {
    const r = await fetch('/api/backend/admin/delivery-zones', { credentials: 'include' });
    const d = await r.json();
    setZones(d.data?.zones || []);
  }

  async function save() {
    setSaving(true);
    const body = { ...form, base_fee_paise: form.base_fee_paise * 100, surge_multiplier: +form.surge_multiplier, cod_limit_paise: form.cod_limit_paise * 100 };
    const r = await fetch('/api/backend/admin/delivery-zones', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { setMsg('✅ Zone created'); loadZones(); }
    else setMsg('❌ Error creating zone');
  }

  async function toggleZone(zone) {
    await fetch(`/api/backend/admin/delivery-zones/${zone.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !zone.is_active }) });
    loadZones();
  }

  async function deleteZone(id) {
    await fetch(`/api/backend/admin/delivery-zones/${id}`, { method: 'DELETE', credentials: 'include' });
    loadZones();
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>🗺️ Delivery Zones</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>Set delivery fees and surge pricing per city zone</p>

      {/* Create form */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Add Zone</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>City</span>
            <select value={form.city_id} onChange={e => setForm(f => ({ ...f, city_id: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }}>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Zone Name</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Central Muzaffarpur" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Base Fee (₹)</span>
            <input type="number" value={form.base_fee_paise} onChange={e => setForm(f => ({ ...f, base_fee_paise: +e.target.value }))} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Surge Multiplier</span>
            <input type="number" min="1" max="5" step="0.1" value={form.surge_multiplier} onChange={e => setForm(f => ({ ...f, surge_multiplier: +e.target.value }))} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Surge Start Hour (0-23)</span>
            <input type="number" min="0" max="23" value={form.surge_start_hour} onChange={e => setForm(f => ({ ...f, surge_start_hour: +e.target.value }))} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Surge End Hour (0-23)</span>
            <input type="number" min="0" max="23" value={form.surge_end_hour} onChange={e => setForm(f => ({ ...f, surge_end_hour: +e.target.value }))} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
        </div>

        {/* COD Settings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>COD Enabled</span>
            <select value={form.cod_enabled ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, cod_enabled: e.target.value === 'yes' }))} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }}>
              <option value="yes">Yes — COD allowed</option>
              <option value="no">No — Online payment only</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>COD Limit (₹)</span>
            <input type="number" min="0" value={form.cod_limit_paise} onChange={e => setForm(f => ({ ...f, cod_limit_paise: +e.target.value }))} placeholder="500" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </label>
        </div>

        {/* Surge preview */}
        {form.surge_multiplier > 1 && (
          <div style={{ background: '#fff7ed', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#92400e' }}>
            During {form.surge_start_hour}:00–{form.surge_end_hour}:00, delivery fee = <strong>₹{Math.round(form.base_fee_paise * form.surge_multiplier)}</strong> ({form.surge_multiplier}× surge)
          </div>
        )}

        <button onClick={save} disabled={saving || !form.name || !form.city_id}
          style={{ padding: '10px 24px', background: '#f97316', color: '#fff', borderRadius: 10, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          {saving ? 'Adding...' : '+ Add Zone'}
        </button>
        {msg && <span style={{ marginLeft: 12, fontSize: 13, color: msg.startsWith('✅') ? '#16a34a' : '#ef4444' }}>{msg}</span>}
      </div>

      {/* Zones list */}
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['City', 'Zone', 'Base Fee', 'Surge', 'Hours', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zones.map(zone => (
              <tr key={zone.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{zone.city?.name || '—'}</td>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{zone.name}</td>
                <td style={{ padding: '10px 14px' }}>₹{Math.round((zone.base_fee_paise || 0) / 100)}</td>
                <td style={{ padding: '10px 14px', color: zone.surge_multiplier > 1 ? '#f97316' : '#9ca3af', fontWeight: zone.surge_multiplier > 1 ? 700 : 400 }}>
                  {zone.surge_multiplier}×
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>{zone.surge_start_hour}:00–{zone.surge_end_hour}:00</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '2px 10px', borderRadius: 20, background: zone.is_active ? '#f0fdf4' : '#f3f4f6', color: zone.is_active ? '#16a34a' : '#9ca3af', fontWeight: 700, fontSize: 12 }}>
                    {zone.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => toggleZone(zone)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>
                    {zone.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => deleteZone(zone.id)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', color: '#ef4444', fontSize: 12 }}>Del</button>
                </td>
              </tr>
            ))}
            {zones.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No delivery zones defined yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
