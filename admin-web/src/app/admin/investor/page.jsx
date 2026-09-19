'use client';
// ────────────────────────────────────────────────────────────
// /admin/investor — P10-6
// Series A Investor Analytics Dashboard
//
// Designed for:
//   • Internal use by founders
//   • Sharing with investors (window.print() → PDF)
//
// Sections:
//   1. Headline KPI cards (Total GMV, Monthly GMV, MoM growth, Orders, Customers, Cities)
//   2. GMV trend — Recharts AreaChart (6-month)
//   3. Cohort retention matrix (heatmap table)
//   4. Unit economics (CAC/LTV/AOV table)
//   5. City breakdown table
//   6. Month-over-month new customers chart
//
// "Export PDF" → window.print() with @media print CSS
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { investorApi } from '../../../lib/api';

// ── Formatters ─────────────────────────────────────────────
const fmtPaise = (v) =>
  v == null ? '—' : `₹${Math.round((v || 0) / 100).toLocaleString('en-IN')}`;

const fmtNum = (v) => (v ?? 0).toLocaleString('en-IN');

const fmtPct = (v, sign = true) =>
  v == null ? '—' : `${sign && v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`;

const fmtMonth = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
};

// ── Skeleton ────────────────────────────────────────────────
function Sk({ h = 20, w = '100%', mb = 0 }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 6, marginBottom: mb,
      background: 'linear-gradient(90deg,var(--surface-2) 25%,var(--border) 50%,var(--surface-2) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  );
}

// ── KPI Card ────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, loading }) {
  return (
    <div style={{
      background:   'var(--surface)',
      borderRadius: 14,
      padding:      '20px 22px',
      border:       '1px solid var(--border)',
      boxShadow:    '0 2px 10px rgba(0,0,0,0.06)',
      minWidth:     0,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
        {label}
      </div>
      {loading ? (
        <>
          <Sk h={28} mb={6} />
          <Sk h={13} w="60%" />
        </>
      ) : (
        <>
          <div style={{ fontSize: 26, fontWeight: 800, color: accent || 'var(--text)', lineHeight: 1.1 }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────
function SectionHeader({ title, description }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
      {description && (
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-3)' }}>{description}</p>
      )}
    </div>
  );
}

// ── Cohort Retention Heatmap ────────────────────────────────
function CohortHeatmap({ monthly }) {
  if (!monthly || monthly.length === 0) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        No cohort data yet. Will populate after first full month of orders.
      </div>
    );
  }

  // Find max month index across all cohorts
  const maxMonthIdx = Math.max(
    ...monthly.map(m => Math.max(...(m.cells || []).map(c => c.month_index || 0), 0))
  );
  const numCols = Math.min(maxMonthIdx + 1, 12);

  const getColor = (pct) => {
    if (pct == null) return 'transparent';
    if (pct >= 80) return 'rgba(22,163,74,0.75)';
    if (pct >= 60) return 'rgba(22,163,74,0.50)';
    if (pct >= 40) return 'rgba(22,163,74,0.30)';
    if (pct >= 20) return 'rgba(217,119,6,0.30)';
    if (pct > 0)   return 'rgba(220,38,38,0.20)';
    return 'rgba(107,114,128,0.1)';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 600, fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-3)', fontSize: 11, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
              Cohort
            </th>
            <th style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--text-3)', fontSize: 11, borderBottom: '1px solid var(--border)' }}>
              Size
            </th>
            {Array.from({ length: numCols }, (_, i) => (
              <th key={i} style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--text-3)', fontSize: 11, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                M{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthly.map((cohort, ri) => (
            <tr key={cohort.cohort_month} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {fmtMonth(cohort.cohort_month)}
              </td>
              <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--text-2)', fontWeight: 600 }}>
                {fmtNum(cohort.total_size)}
              </td>
              {Array.from({ length: numCols }, (_, i) => {
                const cell = (cohort.cells || []).find(c => c.month_index === i);
                const pct  = cell?.retention_pct ?? null;
                return (
                  <td key={i} style={{
                    padding:    '10px 10px',
                    textAlign:  'center',
                    background: getColor(pct),
                    fontWeight: i === 0 ? 700 : 600,
                    color:      pct != null ? (pct >= 40 ? '#166534' : pct >= 20 ? '#92400e' : 'var(--text-3)') : 'var(--text-3)',
                    fontSize:   12,
                    transition: 'background 0.15s',
                  }}>
                    {pct != null ? `${pct}%` : <span style={{ opacity: 0.3 }}>—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
        M1 = month of acquisition (always 100%). Darker green = higher retention.
      </p>
    </div>
  );
}

// ── Custom Tooltip ──────────────────────────────────────────
function GmvTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:   'var(--surface)',
      border:       '1px solid var(--border)',
      borderRadius: 10,
      padding:      '10px 14px',
      fontSize:     13,
      boxShadow:    '0 4px 16px rgba(0,0,0,0.12)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {fmtPaise(p.value * 100)}
        </div>
      ))}
    </div>
  );
}

// ── P11-5: ShareLinkButton — generate 7-day read-only investor link ──────────
function ShareLinkButton() {
  const [link,       setLink]       = useState(null);
  const [copied,     setCopied]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState('');

  const generateLink = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const res = await investorApi.generateLink();
      if (!res?.token) throw new Error('No token returned');
      const fullUrl = `${window.location.origin}/investor-report/${res.token}`;
      setLink(fullUrl);
    } catch (err) {
      setGenError(err.message || 'Failed to generate link');
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {!link ? (
        <>
          <button
            onClick={generateLink}
            disabled={generating}
            style={{
              padding: '9px 18px', borderRadius: 10,
              border: '1px solid var(--border)',
              background: generating ? 'var(--surface-2)' : 'var(--surface)',
              color: 'var(--primary)', fontWeight: 700, fontSize: 13,
              cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {generating ? '⏳ Generating…' : '🔗 Share Link'}
          </button>
          {genError && (
            <span style={{ fontSize: 11, color: '#dc2626' }}>{genError}</span>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={link}
              readOnly
              onClick={e => e.target.select()}
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 11,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text-2)', fontFamily: 'monospace', minWidth: 0,
              }}
            />
            <button
              onClick={copyLink}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none',
                background: copied ? 'var(--success, #16a34a)' : 'var(--primary)',
                color: '#fff', fontWeight: 700, fontSize: 12,
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.2s',
              }}
            >
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Valid 7 days · Read-only · No login required
          </span>
          <button
            onClick={() => { setLink(null); setGenError(''); }}
            style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', textAlign: 'left', padding: 0 }}
          >
            Generate new link
          </button>
        </div>
      )}
    </div>
  );
}

// ── P11-6: MarketingSpendPanel — spend entry + CAC display ───────────────────
const CHANNELS = ['meta', 'google', 'influencer', 'whatsapp', 'other'];

function MarketingSpendPanel({ spendRows = [], onAdded }) {
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');
  const [form, setForm] = useState({
    month:    new Date().toISOString().slice(0, 7), // 'YYYY-MM'
    channel:  'meta',
    campaign_name: '',
    amount_rupees: '',  // User enters rupees; we convert to paise on submit
    new_customers_attributed: '',
    notes: '',
  });

  const fmtR  = (p) => p ? `₹${Math.round(p / 100).toLocaleString('en-IN')}` : '₹0';
  const fmtMo = (d) => { try { return new Date(d + 'T00:00:00').toLocaleString('en-IN', { month: 'short', year: '2-digit' }); } catch { return d; } };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount_rupees && form.amount_rupees !== '0') { setFormErr('Amount is required'); return; }
    setSaving(true); setFormErr('');
    try {
      await investorApi.addSpend({
        month:                    form.month + '-01',
        channel:                  form.channel,
        campaign_name:            form.campaign_name || null,
        amount_paise:             Math.round(parseFloat(form.amount_rupees || 0) * 100),
        new_customers_attributed: parseInt(form.new_customers_attributed || 0, 10),
        notes:                    form.notes || null,
      });
      setShowForm(false);
      setForm(f => ({ ...f, campaign_name: '', amount_rupees: '', new_customers_attributed: '', notes: '' }));
      if (onAdded) onAdded(); // Triggers parent reload
    } catch (err) {
      setFormErr(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // CAC summary from rows
  const totalSpend     = spendRows.reduce((s, r) => s + (r.amount_paise || 0), 0);
  const totalPaidCust  = spendRows.reduce((s, r) => s + (r.new_customers_attributed || 0), 0);
  const blendedCac     = totalPaidCust > 0 ? Math.floor(totalSpend / totalPaidCust) : null;

  const card = { background: 'var(--surface)', borderRadius: 14, padding: '20px 22px', border: '1px solid var(--border)', marginBottom: 24 };
  const th   = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: '1px solid var(--border)' };
  const td   = { padding: '9px 12px', fontSize: 13, color: 'var(--text-2)', borderBottom: '1px solid var(--border)' };
  const inp  = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>📢 Marketing Spend</h2>
          {blendedCac != null && (
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Blended CAC: <strong style={{ color: 'var(--text)' }}>{fmtR(blendedCac)}</strong>
              {' '}({fmtR(totalSpend)} / {totalPaidCust} paid customers)
            </p>
          )}
          {blendedCac == null && (
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              CAC: ₹0 — 100% organic. Add spend rows when paid campaigns begin.
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          {showForm ? '✕ Cancel' : '+ Add Spend'}
        </button>
      </div>

      {/* Add Spend Form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16, padding: '14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Month</label>
            <input type="month" style={inp} value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} required />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Channel</label>
            <select style={inp} value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Campaign (optional)</label>
            <input style={inp} placeholder="e.g. Patna launch" value={form.campaign_name} onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Amount (₹)</label>
            <input type="number" min="0" step="1" style={inp} placeholder="5000" value={form.amount_rupees} onChange={e => setForm(f => ({ ...f, amount_rupees: e.target.value }))} required />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Customers Attributed</label>
            <input type="number" min="0" step="1" style={inp} placeholder="0" value={form.new_customers_attributed} onChange={e => setForm(f => ({ ...f, new_customers_attributed: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" disabled={saving} style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save Row'}
            </button>
          </div>
          {formErr && <div style={{ gridColumn: '1/-1', fontSize: 12, color: '#dc2626' }}>{formErr}</div>}
        </form>
      )}

      {/* Spend table */}
      {spendRows.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Month', 'Channel', 'Campaign', 'Spend', 'Customers', 'CAC'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spendRows.map((r, i) => {
                const rowCac = r.new_customers_attributed > 0 ? Math.floor(r.amount_paise / r.new_customers_attributed) : null;
                return (
                  <tr key={i}>
                    <td style={td}>{fmtMo(r.month)}</td>
                    <td style={td}><span style={{ textTransform: 'capitalize' }}>{r.channel}</span></td>
                    <td style={{ ...td, color: 'var(--text-3)' }}>{r.campaign_name || '—'}</td>
                    <td style={td}>{fmtR(r.amount_paise)}</td>
                    <td style={td}>{r.new_customers_attributed || 0}</td>
                    <td style={{ ...td, fontWeight: 700, color: rowCac ? 'var(--text)' : 'var(--text-3)' }}>
                      {rowCac ? fmtR(rowCac) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          No spend recorded yet. All growth is organic.
        </p>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────
export default function InvestorPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await investorApi.getMetrics();
      setData(res.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load investor metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const s         = data?.summary || {};
  const monthly   = data?.monthly_metrics || [];
  const cohorts   = data?.cohort_matrix   || {};
  const cities    = data?.city_breakdown   || [];

  // Build cohort array for heatmap
  const cohortArray = Object.entries(cohorts).map(([cm, val]) => ({
    cohort_month: cm,
    total_size:   val.total || 0,
    cells:        Object.entries(val.months || {}).map(([idx, cell]) => ({
      month_index:   Number(idx),
      retention_pct: cell.retention_pct,
      active_users:  cell.active_users,
      gmv_paise:     cell.gmv_paise,
    })),
  })).sort((a, b) => a.cohort_month.localeCompare(b.cohort_month));

  // Recharts data — GMV in rupees (divide paise by 100)
  const chartData = monthly.map(m => ({
    month:       fmtMonth(m.month),
    gmv:         Math.round((m.gmv_paise || 0) / 100),
    orders:      m.order_count || 0,
    newCustomers:m.new_customers || 0,
    growth:      m.gmv_growth_pct,
  }));

  const lastUpdated = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div id="investor-page">

      {/* ── Page Header ─────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'space-between',
        marginBottom:   28,
        flexWrap:       'wrap',
        gap:            12,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
            📈 TezzNirmaan — Investor Metrics
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            Series A readiness dashboard · Last updated {lastUpdated}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* P11-5: Shareable read-only link */}
          <ShareLinkButton />
          <button
            onClick={() => window.print()}
            id="export-pdf-btn"
            style={{
              padding:      '9px 18px',
              borderRadius: 10,
              border:       '1px solid var(--border)',
              background:   'var(--surface)',
              color:        'var(--text-2)',
              fontWeight:   700,
              fontSize:     13,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          6,
            }}
          >
            🖨 Export PDF
          </button>
          <button
            onClick={() => load()}
            id="refresh-investor-btn"
            style={{
              padding:      '9px 18px',
              borderRadius: 10,
              border:       '1px solid var(--border)',
              background:   'var(--surface)',
              color:        'var(--text-2)',
              fontWeight:   700,
              fontSize:     13,
              cursor:       'pointer',
            }}
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 24,
          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
          color: '#dc2626', fontSize: 13,
        }}>
          {error} <button onClick={load} style={{ marginLeft: 10, fontWeight: 700, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* ── Section 1: Headline KPIs ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 32 }}>
        <KpiCard
          loading={loading}
          label="Total GMV (All Time)"
          value={fmtPaise(s.total_gmv_paise)}
          sub={`${fmtNum(s.total_orders)} orders`}
          accent="var(--primary)"
        />
        <KpiCard
          loading={loading}
          label="This Month GMV"
          value={fmtPaise(s.latest_month_gmv_paise)}
          sub={s.latest_month_growth_pct != null
            ? `${fmtPct(s.latest_month_growth_pct)} vs last month`
            : 'First month'}
          accent={s.latest_month_growth_pct >= 15 ? '#16a34a' : s.latest_month_growth_pct >= 0 ? 'var(--primary)' : '#dc2626'}
        />
        <KpiCard
          loading={loading}
          label="Avg MoM Growth"
          value={s.avg_monthly_gmv_growth_pct != null ? `${s.avg_monthly_gmv_growth_pct}%` : '—'}
          sub="Investor target: 15–20%"
          accent={parseFloat(s.avg_monthly_gmv_growth_pct) >= 15 ? '#16a34a' : 'var(--primary)'}
        />
        <KpiCard
          loading={loading}
          label="Total Customers"
          value={fmtNum(s.total_customers)}
          sub={`${fmtNum(s.avg_orders_per_customer)} orders/customer`}
        />
        <KpiCard
          loading={loading}
          label="Total Orders"
          value={fmtNum(s.total_orders)}
          sub={`AOV: ${fmtPaise(s.avg_order_value_paise)}`}
        />
        <KpiCard
          loading={loading}
          label="Active Cities"
          value={fmtNum(s.active_cities)}
          sub="Live city deployments"
        />
      </div>

      {/* ── Section 2: GMV Trend Chart ───────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <SectionHeader
          title="GMV Trend"
          description="Monthly Gross Merchandise Value — the primary Series A growth metric"
        />
        <div style={{
          background:   'var(--surface)',
          borderRadius: 14,
          padding:      '24px 8px 16px',
          border:       '1px solid var(--border)',
          boxShadow:    '0 1px 6px rgba(0,0,0,0.06)',
        }}>
          {loading ? (
            <Sk h={200} />
          ) : chartData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No monthly data yet. Will appear after the nightly calculation runs.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 20, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#e8740c" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#e8740c" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<GmvTooltip />} />
                <Area
                  type="monotone"
                  dataKey="gmv"
                  name="GMV"
                  stroke="#e8740c"
                  strokeWidth={2.5}
                  fill="url(#gmvGrad)"
                  dot={{ fill: '#e8740c', r: 4 }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Section 2b: New Customers Bar Chart ──────────── */}
      {!loading && chartData.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <SectionHeader
            title="New Customer Acquisition"
            description="Monthly new customers (first-time orders)"
          />
          <div style={{
            background:   'var(--surface)',
            borderRadius: 14,
            padding:      '24px 8px 16px',
            border:       '1px solid var(--border)',
            boxShadow:    '0 1px 6px rgba(0,0,0,0.06)',
          }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, fontSize: 12,
                  }}
                />
                <Bar dataKey="newCustomers" name="New Customers" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Section 3: Cohort Retention Matrix ───────────── */}
      <div style={{ marginBottom: 36 }}>
        <SectionHeader
          title="Cohort Retention Matrix"
          description="Investor benchmark: 40%+ retention at Month 3 signals product-market fit"
        />
        <div style={{
          background:   'var(--surface)',
          borderRadius: 14,
          border:       '1px solid var(--border)',
          overflow:     'hidden',
          boxShadow:    '0 1px 6px rgba(0,0,0,0.06)',
        }}>
          {loading ? (
            <div style={{ padding: 24 }}><Sk h={120} /></div>
          ) : (
            <CohortHeatmap monthly={cohortArray} />
          )}
        </div>
      </div>

      {/* ── Section 4: Unit Economics ─────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <SectionHeader
          title="Unit Economics"
          description="Series A benchmark: LTV:CAC ≥ 3:1 with &lt;12-month payback"
        />
        <div style={{
          display:      'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
          gap:          12,
        }}>
          {[
            {
              label: 'Customer Acquisition Cost',
              value: '₹0',
              sub:   '100% organic growth',
              note:  '(Update when paid campaigns begin)',
              accent: '#16a34a',
            },
            {
              label: 'Lifetime Value (LTV)',
              value: loading ? '…' : fmtPaise(s.ltv_paise),
              sub:   loading ? '' : `${s.avg_orders_per_customer} orders × ${fmtPaise(s.avg_order_value_paise)} AOV`,
              accent: 'var(--primary)',
            },
            {
              label: 'LTV : CAC Ratio',
              value: '∞',
              sub:   'Organic growth = infinite ROI',
              accent: '#16a34a',
            },
            {
              label: 'CAC Payback Period',
              value: '0 months',
              sub:   'Immediate (CAC = ₹0)',
              accent: '#16a34a',
            },
          ].map(({ label, value, sub, note, accent }) => (
            <div key={label} style={{
              background:   'var(--surface)',
              borderRadius: 12,
              padding:      '18px 20px',
              border:       '1px solid var(--border)',
              boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: accent }}>{value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
              {note && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontStyle: 'italic' }}>{note}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 5: City Breakdown ─────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <SectionHeader
          title="City Breakdown (Last 30 Days)"
          description="GMV and order volume by city — shows geographic expansion"
        />
        <div style={{
          background:   'var(--surface)',
          borderRadius: 14,
          border:       '1px solid var(--border)',
          overflow:     'hidden',
          boxShadow:    '0 1px 6px rgba(0,0,0,0.06)',
        }}>
          {loading ? (
            <div style={{ padding: 20 }}>{[1,2,3].map(i => <Sk key={i} h={40} mb={8} />)}</div>
          ) : cities.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No city data for the last 30 days.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['City', 'GMV (30 days)', 'Orders', 'Avg Order Value', 'Share'].map(h => (
                    <th key={h} style={{
                      padding: '11px 16px', textAlign: h === 'City' ? 'left' : 'right',
                      fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                      letterSpacing: 0.6, textTransform: 'uppercase',
                      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalGmv = cities.reduce((s, c) => s + c.gmv_paise, 0);
                  return cities.map((city, i) => (
                    <tr key={city.name} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}>
                      <td style={{ padding: '13px 16px', fontWeight: 700, color: 'var(--text)' }}>{city.name}</td>
                      <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{fmtPaise(city.gmv_paise)}</td>
                      <td style={{ padding: '13px 16px', textAlign: 'right', color: 'var(--text-2)', fontWeight: 600 }}>{fmtNum(city.order_count)}</td>
                      <td style={{ padding: '13px 16px', textAlign: 'right', color: 'var(--text-2)' }}>
                        {city.order_count > 0 ? fmtPaise(Math.round(city.gmv_paise / city.order_count)) : '—'}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div style={{
                            width: 60, height: 6, borderRadius: 3,
                            background: 'var(--surface-2)', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: totalGmv > 0 ? `${(city.gmv_paise / totalGmv * 100).toFixed(0)}%` : '0%',
                              height: '100%', borderRadius: 3,
                              background: 'var(--primary)',
                            }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
                            {totalGmv > 0 ? `${(city.gmv_paise / totalGmv * 100).toFixed(0)}%` : '—'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Marketing Spend + CAC ─────────────────────────── */}
      <MarketingSpendPanel
        spendRows={data?.marketing_spend || []}
        onAdded={load}
      />

      {/* ── Disclaimer ──────────────────────────────────── */}
      <div style={{
        padding:      '14px 18px',
        borderRadius: 10,
        background:   'var(--surface-2)',
        border:       '1px solid var(--border)',
        fontSize:     12,
        color:        'var(--text-3)',
        marginBottom: 32,
      }}>
        <strong>Note:</strong> GMV and order counts are sourced from the monthly_metrics nightly snapshot
        (calculated at 1 AM UTC). City breakdown is live (last 30 days). Cohort retention populates
        after the first full month of operations. CAC = ₹0 reflects 100% organic customer acquisition.
      </div>

      {/* ── Print / PDF styles ───────────────────────────── */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media print {
          /* Hide nav, buttons, sidebar when printing */
          header, nav, button, [class*="sidebar"],
          #export-pdf-btn, #refresh-investor-btn {
            display: none !important;
          }
          body { background: #fff !important; color: #000 !important; }
          #investor-page { padding: 0 !important; }
          /* Force page breaks between sections */
          .page-break { page-break-before: always; }
        }
      `}</style>
    </div>
  );
}
