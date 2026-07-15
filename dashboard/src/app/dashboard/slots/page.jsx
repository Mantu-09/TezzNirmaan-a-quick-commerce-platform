'use client';
// ────────────────────────────────────────────────────────────
// Dashboard Slots Page — B6
// Two views in one page:
//   "Day View" tab   — today's/selected date slot bookings with capacity bars
//   "Templates" tab  — manage slot templates (create, enable/disable, edit capacity)
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { slotsApi } from '../../../lib/api';

// ── Helpers ───────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function dateLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Shared card ───────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background:   'var(--surface)',
      border:       '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      padding:      'var(--s5)',
      boxShadow:    'var(--shadow-sm)',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Capacity bar ──────────────────────────────────────────────
function CapBar({ count, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
  const color = pct >= 100 ? '#DC2626' : pct >= 75 ? '#D97706' : '#16A34A';
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font)', marginBottom: 3 }}>
        <span>{count} booked</span>
        <span>{max - count} left</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
function Skel({ h = 14, w = '100%', mb = 8 }) {
  return (
    <div style={{ height: h, width: w, borderRadius: 6, background: 'var(--surface-2)', animation: 'pulse 1.4s ease infinite', marginBottom: mb }} />
  );
}

// ═══════════════════════════════════════════════════════════════
// DAY VIEW — slot bookings for a chosen date
// ═══════════════════════════════════════════════════════════════
function DayView({ shopId }) {
  const [date,     setDate]     = useState(today());
  const [bookings, setBookings] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(async (d) => {
    setLoading(true);
    setError('');
    try {
      const [bRes, tRes] = await Promise.all([
        slotsApi.getBookings(d),
        slotsApi.getTemplates(),
      ]);
      setBookings(bRes?.bookings  || []);
      setTemplates(tRes?.templates || []);
    } catch (e) {
      setError(e.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date]);

  // Get the day-of-week for the selected date to match templates
  const dow = new Date(date).getDay(); // 0=Sun
  const dayTemplates = templates.filter(t => t.day_of_week === dow && t.is_active);

  // Build a merged view: template slots + their actual bookings
  const slots = dayTemplates.map(tmpl => {
    const booked = bookings.find(
      b => b.slotStart === tmpl.start_time && b.slotEnd === tmpl.end_time
    );
    return {
      ...tmpl,
      bookings: booked?.bookings || [],
      bookingCount: booked?.bookings?.length || 0,
    };
  });

  // Also include slots in bookings that have no template (edge case)
  const unmatchedBookings = bookings.filter(b =>
    !dayTemplates.some(t => t.start_time === b.slotStart && t.end_time === b.slotEnd)
  );

  // Date navigation (prev/next day, max 14 days ahead)
  const prevDate = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split('T')[0]);
  };
  const nextDate = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 14);
    if (d <= maxDate) setDate(d.toISOString().split('T')[0]);
  };

  return (
    <div>
      {/* Date navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s5)' }}>
        <button onClick={prevDate} style={navBtn}>‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
            {dateLabel(date)}
          </div>
          <div style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {date === today() ? 'Today' : ''}
          </div>
        </div>
        <button onClick={nextDate} style={navBtn}>›</button>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ ...inputStyle, width: 140 }}
        />
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--s4)' }}>
          {[1,2,3,4].map(i => <Card key={i}><Skel h={80} /></Card>)}
        </div>
      ) : slots.length === 0 && unmatchedBookings.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗓️</div>
            <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
              {dayTemplates.length === 0
                ? `No active slot templates for ${DAYS_FULL[dow]}`
                : 'No bookings yet for this date'
              }
            </div>
            <div style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text-2)' }}>
              {dayTemplates.length === 0
                ? 'Go to the Templates tab to create delivery slots for this day.'
                : 'Slot bookings will appear here when customers place scheduled orders.'
              }
            </div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--s4)' }}>
          {slots.map(slot => {
            const isFull = slot.bookingCount >= slot.max_orders;
            return (
              <Card key={slot.id}>
                {/* Slot header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                      {fmtTime(slot.start_time)} – {fmtTime(slot.end_time)}
                    </div>
                    <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      Max {slot.max_orders} orders
                    </div>
                  </div>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px', borderRadius: 4,
                    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font)',
                    background: isFull ? '#FEE2E2' : '#DCFCE7',
                    color:      isFull ? '#DC2626' : '#16A34A',
                  }}>
                    {isFull ? 'FULL' : `${slot.max_orders - slot.bookingCount} left`}
                  </span>
                </div>

                <CapBar count={slot.bookingCount} max={slot.max_orders} />

                {/* Booking list */}
                {slot.bookings.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    {slot.bookings.slice(0, 3).map(b => (
                      <div key={b.bookingId} style={{ marginBottom: 6 }}>
                        <div style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                          {b.customer || 'Customer'} · {b.orderNum}
                        </div>
                        <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--text-3)' }}>
                          {b.phone} · {b.subOrderNum}
                        </div>
                      </div>
                    ))}
                    {slot.bookings.length > 3 && (
                      <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                        +{slot.bookings.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Unmatched (no template) bookings */}
          {unmatchedBookings.map(group => (
            <Card key={`${group.slotStart}-${group.slotEnd}`} style={{ borderColor: 'var(--warning)' }}>
              <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                ⚠️ {fmtTime(group.slotStart)} – {fmtTime(group.slotEnd)}
              </div>
              <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--text-2)', marginBottom: 8 }}>
                {group.bookings.length} booking{group.bookings.length !== 1 ? 's' : ''} (no active template)
              </div>
              {group.bookings.slice(0, 2).map(b => (
                <div key={b.bookingId} style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>
                  {b.customer} · {b.orderNum}
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATES VIEW — manage slot templates
// ═══════════════════════════════════════════════════════════════
function TemplatesView() {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [editId,    setEditId]    = useState(null);  // template being edited inline
  const [editMax,   setEditMax]   = useState('');

  // New template form state
  const [form, setForm] = useState({
    day_of_week: 1, start_time: '09:00', end_time: '12:00', max_orders: 10,
  });
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await slotsApi.getTemplates();
      setTemplates(res?.templates || []);
    } catch (e) {
      setError(e.message || 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setFormErr('');
    if (form.start_time >= form.end_time) { setFormErr('Start time must be before end time.'); return; }
    setSaving(true);
    try {
      await slotsApi.createTemplate({
        day_of_week: +form.day_of_week,
        start_time:  form.start_time,
        end_time:    form.end_time,
        max_orders:  +form.max_orders,
      });
      setShowForm(false);
      setForm({ day_of_week: 1, start_time: '09:00', end_time: '12:00', max_orders: 10 });
      await load();
    } catch (e) {
      setFormErr(e.message || 'Failed to create slot.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (tmpl) => {
    try {
      await slotsApi.updateTemplate(tmpl.id, { is_active: !tmpl.is_active });
      setTemplates(prev => prev.map(t => t.id === tmpl.id ? { ...t, is_active: !t.is_active } : t));
    } catch (e) {
      alert(e.message || 'Failed to update.');
    }
  };

  const handleSaveMax = async (id) => {
    const v = parseInt(editMax, 10);
    if (!v || v < 1) { alert('Max orders must be at least 1'); return; }
    try {
      await slotsApi.updateTemplate(id, { max_orders: v });
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, max_orders: v } : t));
      setEditId(null);
    } catch (e) {
      alert(e.message || 'Failed to save.');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this slot template? If future orders exist it will be deactivated instead.')) return;
    try {
      await slotsApi.deleteTemplate(id);
      await load();
    } catch (e) {
      alert(e.message || 'Failed to delete.');
    }
  };

  const handleSeedDefaults = async () => {
    if (!confirm('This will add Mon–Sat 8am–8pm (3h windows) default slots. Continue?')) return;
    try {
      await slotsApi.seedDefaults();
      await load();
    } catch (e) {
      alert(e.message || 'Failed to seed defaults.');
    }
  };

  // Group templates by day_of_week
  const byDay = {};
  for (let d = 0; d <= 6; d++) byDay[d] = [];
  for (const t of templates) {
    if (byDay[t.day_of_week]) byDay[t.day_of_week].push(t);
  }

  return (
    <div>
      {/* Actions bar */}
      <div style={{ display: 'flex', gap: 'var(--s3)', marginBottom: 'var(--s5)', flexWrap: 'wrap' }}>
        <button onClick={() => setShowForm(s => !s)} style={primaryBtn}>
          {showForm ? '✕ Cancel' : '+ Add slot'}
        </button>
        {templates.length === 0 && (
          <button onClick={handleSeedDefaults} style={secondaryBtn}>
            ⚡ Seed defaults (Mon–Sat)
          </button>
        )}
      </div>

      {/* New template form */}
      {showForm && (
        <Card style={{ marginBottom: 'var(--s5)', borderColor: 'var(--primary)' }}>
          <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 'var(--s4)' }}>
            New Slot Template
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--s3)', marginBottom: 'var(--s4)' }}>
            <div>
              <label style={labelStyle}>Day of week</label>
              <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: +e.target.value }))} style={inputStyle}>
                {DAYS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Start time</label>
              <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>End time</label>
              <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Max orders</label>
              <input type="number" min="1" max="200" value={form.max_orders} onChange={e => setForm(f => ({ ...f, max_orders: +e.target.value }))} style={inputStyle} />
            </div>
          </div>
          {formErr && <div style={{ color: 'var(--error)', fontFamily: 'var(--font)', fontSize: 13, marginBottom: 'var(--s3)' }}>{formErr}</div>}
          <button onClick={handleCreate} disabled={saving} style={primaryBtn}>
            {saving ? 'Saving…' : 'Create Slot'}
          </button>
        </Card>
      )}

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <div>{[1,2,3].map(i => <div key={i} style={{ marginBottom: 'var(--s4)' }}><Skel h={80} /></div>)}</div>
      ) : templates.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗓️</div>
            <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
              No delivery slots configured
            </div>
            <div style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
              Create slot templates to give customers real delivery windows for scheduled orders.
            </div>
            <button onClick={handleSeedDefaults} style={primaryBtn}>
              ⚡ Seed default slots (Mon–Sat, 8am–8pm)
            </button>
          </div>
        </Card>
      ) : (
        // Group by day
        Object.entries(byDay)
          .filter(([, slots]) => slots.length > 0)
          .map(([dow, slots]) => (
            <div key={dow} style={{ marginBottom: 'var(--s5)' }}>
              <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 14, color: 'var(--text-2)', marginBottom: 'var(--s3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12 }}>
                {DAYS_FULL[+dow]}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
                {slots.sort((a, b) => a.start_time.localeCompare(b.start_time)).map(t => (
                  <Card key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s4)', padding: 'var(--s3) var(--s4)', flexWrap: 'wrap' }}>
                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggle(t)}
                      title={t.is_active ? 'Click to deactivate' : 'Click to activate'}
                      style={{
                        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: t.is_active ? 'var(--primary)' : 'var(--border)',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                        position: 'relative',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 3, left: t.is_active ? 18 : 3,
                        width: 14, height: 14, borderRadius: 7, background: '#fff',
                        transition: 'left 0.2s',
                      }} />
                    </button>

                    {/* Time window */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontFamily: 'var(--font)', fontWeight: 600, fontSize: 14, color: t.is_active ? 'var(--text)' : 'var(--text-3)' }}>
                        {fmtTime(t.start_time)} – {fmtTime(t.end_time)}
                      </div>
                      {!t.is_active && (
                        <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--text-3)' }}>Inactive</div>
                      )}
                    </div>

                    {/* Max orders — inline edit */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {editId === t.id ? (
                        <>
                          <input
                            type="number" min="1" value={editMax}
                            onChange={e => setEditMax(e.target.value)}
                            style={{ ...inputStyle, width: 64, padding: '4px 8px' }}
                            autoFocus
                          />
                          <button onClick={() => handleSaveMax(t.id)} style={{ ...primaryBtn, padding: '4px 10px', fontSize: 12 }}>✓</button>
                          <button onClick={() => setEditId(null)} style={{ ...secondaryBtn, padding: '4px 10px', fontSize: 12 }}>✕</button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setEditId(t.id); setEditMax(String(t.max_orders)); }}
                          style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '4px 10px', cursor: 'pointer' }}
                        >
                          Max {t.max_orders} ✎
                        </button>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(t.id)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 16, padding: '4px 6px' }}
                      title="Delete slot"
                    >
                      🗑
                    </button>
                  </Card>
                ))}
              </div>
            </div>
          ))
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function SlotsPage() {
  const [tab, setTab] = useState('day'); // 'day' | 'templates'

  return (
    <div style={{ padding: 'var(--s6)', fontFamily: 'var(--font)', maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--s5)' }}>
        <h1 style={{ fontFamily: 'var(--font)', fontWeight: 800, fontSize: 22, color: 'var(--text)', margin: 0 }}>
          Delivery Slots
        </h1>
        <p style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>
          Manage scheduled delivery capacity and see daily booking loads.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', marginBottom: 'var(--s6)', width: 'fit-content' }}>
        {[
          { key: 'day',       label: '📅 Day View' },
          { key: 'templates', label: '⚙️ Templates' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding:    '8px 22px',
              border:     'none',
              borderRight: '1px solid var(--border)',
              background:  tab === t.key ? 'var(--primary)' : 'var(--surface)',
              color:       tab === t.key ? '#fff' : 'var(--text)',
              fontFamily:  'var(--font)',
              fontWeight:  tab === t.key ? 700 : 400,
              fontSize:    14,
              cursor:      'pointer',
              transition:  'background 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'day'       && <DayView />}
      {tab === 'templates' && <TemplatesView />}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────
const primaryBtn = {
  background:   'var(--primary)',
  color:        '#fff',
  border:       'none',
  borderRadius: 'var(--r-md)',
  padding:      '8px 18px',
  cursor:       'pointer',
  fontFamily:   'var(--font)',
  fontWeight:   600,
  fontSize:     13,
};

const secondaryBtn = {
  background:   'var(--surface)',
  color:        'var(--text)',
  border:       '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  padding:      '8px 18px',
  cursor:       'pointer',
  fontFamily:   'var(--font)',
  fontWeight:   400,
  fontSize:     13,
};

const labelStyle = {
  display:    'block',
  fontFamily: 'var(--font)',
  fontSize:   12,
  fontWeight: 600,
  color:      'var(--text-2)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const inputStyle = {
  width:        '100%',
  padding:      '8px 10px',
  border:       '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  fontFamily:   'var(--font)',
  fontSize:     13,
  color:        'var(--text)',
  background:   'var(--surface)',
  boxSizing:    'border-box',
};

const errorBox = {
  background:   '#FEE2E2',
  border:       '1px solid #DC2626',
  borderRadius: 'var(--r-md)',
  padding:      '10px 14px',
  marginBottom: 'var(--s4)',
  color:        '#DC2626',
  fontFamily:   'var(--font)',
  fontSize:     13,
};

const navBtn = {
  background:   'var(--surface)',
  border:       '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  width:        36, height: 36,
  cursor:       'pointer',
  fontFamily:   'var(--font)',
  fontSize:     20,
  color:        'var(--text)',
  display:      'flex',
  alignItems:   'center',
  justifyContent: 'center',
};
