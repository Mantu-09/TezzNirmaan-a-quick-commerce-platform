'use client';
// ────────────────────────────────────────────────────────────
// Admin: New Campaign — P8-3
// Route: /admin/campaigns/new
//
// Full-featured campaign creation form:
//   • Notification title (60 chars) + body (100 chars) with live counters
//   • Optional image URL + deep link picker
//   • Audience radio group with live recipient count preview
//   • City selector (shown only when a city_* audience is selected)
//   • Send mode: immediately or schedule picker
//   • Save as draft | Schedule | Send now
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { campaignsApi } from '../../../../lib/api';

const AUDIENCE_OPTIONS = [
  { value: 'all_customers',         label: 'All customers',        icon: '👥', desc: 'Every registered customer with push enabled' },
  { value: 'active_last_7_days',    label: 'Active last 7 days',   icon: '🔥', desc: 'Placed ≥1 order in the past week' },
  { value: 'inactive_30_plus_days', label: 'Inactive 30+ days',    icon: '😴', desc: 'Win-back — no orders in over a month' },
  { value: 'pass_subscribers',      label: 'Pass subscribers',     icon: '⭐', desc: 'Active TezzPass members' },
  { value: 'no_orders_yet',         label: 'No orders yet',        icon: '🎯', desc: 'Conversion — registered but never ordered' },
  { value: 'contractors_only',      label: 'Contractors only',     icon: '🏗️', desc: 'Verified B2B contractor profiles' },
  { value: 'city_patna',            label: 'City: Patna',          icon: '🏙️', desc: '' },
  { value: 'city_muzaffarpur',      label: 'City: Muzaffarpur',    icon: '🏙️', desc: '' },
  { value: 'city_bhagalpur',        label: 'City: Bhagalpur',      icon: '🏙️', desc: '' },
  { value: 'city_gaya',             label: 'City: Gaya',           icon: '🏙️', desc: '' },
];

const DEEP_LINK_OPTIONS = [
  { value: '',                        label: 'Home screen (default)' },
  { value: 'tezznirmaan://orders',    label: 'My Orders' },
  { value: 'tezznirmaan://pass',      label: 'TezzPass screen' },
  { value: 'tezznirmaan://shop',      label: 'Browse shops' },
  { value: 'tezznirmaan://deals',     label: 'Deals & Offers' },
];

const inputBase = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg-1)',
  color: 'var(--text-1)', fontSize: 14, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
};

function CharCount({ current, max }) {
  const over = current > max;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600,
      color: over ? '#dc2626' : current > max * 0.8 ? '#d97706' : 'var(--text-3)',
      marginLeft: 6,
    }}>
      {current}/{max}
    </span>
  );
}

export default function NewCampaignPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    title:       '',
    body:        '',
    image_url:   '',
    deep_link:   '',
    audience:    'all_customers',
    send_mode:   'draft',     // 'draft' | 'now' | 'schedule'
    scheduled_at_date: '',
    scheduled_at_time: '09:00',
  });

  const [previewCount,    setPreviewCount]    = useState(null);
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [error,           setError]           = useState('');
  const [success,         setSuccess]         = useState('');
  const previewTimer = useRef(null);

  // Live audience preview — debounced 500ms after audience change
  const fetchPreview = useCallback(async (audience) => {
    if (!audience) return;
    setPreviewLoading(true);
    try {
      const res = await campaignsApi.preview(audience);
      setPreviewCount(res.recipient_count);
    } catch {
      setPreviewCount(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => fetchPreview(form.audience), 400);
    return () => clearTimeout(previewTimer.current);
  }, [form.audience, fetchPreview]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setError('');
  };

  const handleSubmit = async (mode) => {
    // Validate
    if (!form.title.trim()) return setError('Title is required');
    if (form.title.length > 65) return setError('Title must be 65 characters or fewer');
    if (!form.body.trim()) return setError('Message is required');
    if (form.body.length > 110) return setError('Message must be 110 characters or fewer');
    if (!form.audience) return setError('Select an audience');

    if (mode === 'schedule') {
      if (!form.scheduled_at_date) return setError('Pick a date to schedule');
      const dt = new Date(`${form.scheduled_at_date}T${form.scheduled_at_time}:00`);
      if (dt <= new Date()) return setError('Scheduled time must be in the future');
    }

    setSubmitting(true);
    setError('');

    try {
      let scheduled_at = null;
      if (mode === 'schedule') {
        scheduled_at = new Date(`${form.scheduled_at_date}T${form.scheduled_at_time}:00`).toISOString();
      }

      // Step 1: Create the campaign
      const { campaign } = await campaignsApi.create({
        title:       form.title.trim(),
        body:        form.body.trim(),
        image_url:   form.image_url.trim() || undefined,
        deep_link:   form.deep_link || undefined,
        audience:    form.audience,
        scheduled_at,
      });

      // Step 2: Send now if requested
      if (mode === 'now') {
        await campaignsApi.sendNow(campaign.id);
        setSuccess(`Campaign queued for immediate send to ~${previewCount} recipients!`);
      } else if (mode === 'schedule') {
        setSuccess(`Campaign scheduled for ${new Date(scheduled_at).toLocaleString('en-IN')}.`);
      } else {
        setSuccess('Campaign saved as draft.');
      }

      // Navigate to detail after 1.5s
      setTimeout(() => router.push(`/admin/campaigns/${campaign.id}`), 1500);

    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const previewLabel = previewLoading
    ? 'Counting…'
    : previewCount !== null
    ? `~${previewCount.toLocaleString('en-IN')} recipients`
    : 'Preview unavailable';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 6 }}>
          <a href="/admin/campaigns" style={{ color: '#7c3aed', textDecoration: 'none' }}>
            ← Campaigns
          </a>
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>
          📣 New Push Campaign
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
          Compose a notification, pick your audience, and send or schedule.
        </p>
      </div>

      {/* Success banner */}
      {success && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(22,163,74,0.08)', color: '#15803d', fontSize: 14,
          border: '1px solid rgba(22,163,74,0.2)', fontWeight: 600,
        }}>
          ✅ {success} Redirecting…
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 14,
          border: '1px solid rgba(220,38,38,0.15)',
        }}>
          ❌ {error}
        </div>
      )}

      {/* ── Section: Notification Content ── */}
      <section style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24, marginBottom: 20,
      }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          📝 Notification Content
        </h2>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            Title (heading)
            <CharCount current={form.title.length} max={65} />
          </label>
          <input
            value={form.title}
            onChange={e => set('title', e.target.value)}
            maxLength={65}
            placeholder="e.g. Monsoon Paint Sale — Today Only!"
            style={inputBase}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            Message
            <CharCount current={form.body.length} max={110} />
          </label>
          <textarea
            value={form.body}
            onChange={e => set('body', e.target.value)}
            maxLength={110}
            rows={3}
            placeholder="e.g. Get 10% off all paints until 8 PM. Tap to order."
            style={{ ...inputBase, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        {/* Phone preview */}
        {(form.title || form.body) && (
          <div style={{
            background: 'rgba(0,0,0,0.04)', borderRadius: 12, padding: '14px 16px',
            border: '1px solid var(--border)', marginBottom: 16,
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 16, flexShrink: 0,
            }}>
              T
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                {form.title || 'Notification title'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>
                {form.body || 'Notification message will appear here.'}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
              Image URL <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(optional rich notification)</span>
            </label>
            <input
              value={form.image_url}
              onChange={e => set('image_url', e.target.value)}
              placeholder="https://…"
              style={inputBase}
              type="url"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
              Deep link (where tap opens)
            </label>
            <select
              value={form.deep_link}
              onChange={e => set('deep_link', e.target.value)}
              style={{ ...inputBase, cursor: 'pointer' }}
            >
              {DEEP_LINK_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Section: Target Audience ── */}
      <section style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            🎯 Target Audience
          </h2>
          <div style={{
            padding: '4px 14px', borderRadius: 20,
            background: previewLoading ? 'var(--bg-1)' : 'rgba(124,58,237,0.08)',
            border: '1px solid rgba(124,58,237,0.2)',
            fontSize: 13, fontWeight: 700, color: '#7c3aed',
            transition: 'all 0.2s',
          }}>
            {previewLabel}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {AUDIENCE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                border: `1px solid ${form.audience === opt.value ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`,
                background: form.audience === opt.value ? 'rgba(124,58,237,0.06)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <input
                type="radio"
                name="audience"
                value={opt.value}
                checked={form.audience === opt.value}
                onChange={() => set('audience', opt.value)}
                style={{ marginTop: 2, accentColor: '#7c3aed' }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                  {opt.icon} {opt.label}
                </div>
                {opt.desc && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    {opt.desc}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* ── Section: Send Options ── */}
      <section style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24, marginBottom: 24,
      }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          🕐 When to Send
        </h2>

        {[
          { value: 'draft',    label: 'Save as draft', desc: 'Save without sending — edit later' },
          { value: 'now',      label: 'Send immediately', desc: `Delivers to ~${previewCount ?? '?'} recipients right now` },
          { value: 'schedule', label: 'Schedule for later', desc: 'Pick a date and time' },
        ].map(opt => (
          <label
            key={opt.value}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${form.send_mode === opt.value ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`,
              background: form.send_mode === opt.value ? 'rgba(124,58,237,0.06)' : 'transparent',
              marginBottom: 8, transition: 'all 0.15s',
            }}
          >
            <input
              type="radio"
              name="send_mode"
              value={opt.value}
              checked={form.send_mode === opt.value}
              onChange={() => set('send_mode', opt.value)}
              style={{ accentColor: '#7c3aed' }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{opt.desc}</div>
            </div>
          </label>
        ))}

        {form.send_mode === 'schedule' && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            marginTop: 12, padding: '16px', borderRadius: 12,
            background: 'var(--bg-1)', border: '1px solid var(--border)',
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                Date
              </label>
              <input
                type="date"
                value={form.scheduled_at_date}
                onChange={e => set('scheduled_at_date', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                style={inputBase}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                Time (IST)
              </label>
              <input
                type="time"
                value={form.scheduled_at_time}
                onChange={e => set('scheduled_at_time', e.target.value)}
                style={inputBase}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <a
          href="/admin/campaigns"
          style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-2)', textDecoration: 'none',
            fontSize: 14, fontWeight: 600,
          }}
        >
          Cancel
        </a>

        {form.send_mode === 'draft' && (
          <button
            onClick={() => handleSubmit('draft')}
            disabled={submitting}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'var(--bg-2)', color: 'var(--text-2)',
              fontSize: 14, fontWeight: 700, opacity: submitting ? 0.6 : 1,
              border: '1px solid var(--border)',
            }}
          >
            {submitting ? 'Saving…' : '💾 Save Draft'}
          </button>
        )}

        {form.send_mode === 'schedule' && (
          <button
            onClick={() => handleSubmit('schedule')}
            disabled={submitting}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              opacity: submitting ? 0.6 : 1,
              boxShadow: '0 2px 8px rgba(29,78,216,0.3)',
            }}
          >
            {submitting ? 'Scheduling…' : '🗓 Schedule Campaign'}
          </button>
        )}

        {form.send_mode === 'now' && (
          <button
            onClick={() => handleSubmit('now')}
            disabled={submitting || previewCount === 0}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              opacity: (submitting || previewCount === 0) ? 0.6 : 1,
              boxShadow: '0 2px 8px rgba(124,58,237,0.35)',
            }}
          >
            {submitting
              ? 'Sending…'
              : `📣 Send Now to ${previewCount !== null ? previewCount.toLocaleString('en-IN') : '?'} recipients`}
          </button>
        )}
      </div>
    </div>
  );
}
