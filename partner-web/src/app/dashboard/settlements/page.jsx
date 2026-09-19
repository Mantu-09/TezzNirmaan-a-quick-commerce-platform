'use client';
// ────────────────────────────────────────────────────────────
// Settlements Page — P4-4B
// Route: /dashboard/settlements
//
// Shows shop owner:
//   1. Summary cards: pending this week, last paid, total earned
//   2. Settlement history table with commission breakdown on hover
//   3. Drill-down drawer: per-order line items
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { fetchMySettlements, fetchSettlementDetail } from '../../../lib/settlementApi';

// ── Formatters ─────────────────────────────────────────────────
const fmtPaise = (p) =>
  `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtPeriod = (start, end) =>
  `${fmtDate(start)} – ${fmtDate(end)}`;

// ── Status Badge ──────────────────────────────────────────────
const STATUS_MAP = {
  pending:    { label: 'Pending',    bg: 'rgba(245,158,11,0.12)', color: '#d97706', dot: '#f59e0b' },
  processing: { label: 'Processing', bg: 'rgba(59,130,246,0.1)',  color: '#2563eb', dot: '#3b82f6' },
  paid:       { label: 'Paid ✓',     bg: 'rgba(22,163,74,0.1)',   color: '#16a34a', dot: '#16a34a' },
  failed:     { label: 'Failed',     bg: 'rgba(220,38,38,0.1)',   color: '#dc2626', dot: '#dc2626' },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </span>
  );
}

// ── Commission Tooltip ─────────────────────────────────────────
function CommissionRow({ batch }) {
  const [show, setShow] = useState(false);
  const pct = batch.order_count > 0
    ? ((batch.commission_paise / batch.gross_amount_paise) * 100).toFixed(1)
    : '5.0';

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{ borderBottom: '1px dashed var(--text-3)', cursor: 'help', fontSize: 13 }}>
        {fmtPaise(batch.net_amount_paise)}
      </span>
      {show && (
        <div style={{
          position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 12px', whiteSpace: 'nowrap',
          fontSize: 12, color: 'var(--text-2)', zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--text)' }}>{fmtPaise(batch.gross_amount_paise)}</strong> gross
          <br />
          − {fmtPaise(batch.commission_paise)} ({pct}% platform fee)
          <br />
          <span style={{ borderTop: '1px solid var(--border)', display: 'block', marginTop: 4, paddingTop: 4 }}>
            = <strong style={{ color: 'var(--primary)' }}>{fmtPaise(batch.net_amount_paise)}</strong> net
          </span>
        </div>
      )}
    </div>
  );
}

// ── Detail Drawer ──────────────────────────────────────────────
function DetailDrawer({ batchId, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchId) return;
    setLoading(true);
    fetchSettlementDetail(batchId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [batchId]);

  if (!batchId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 199,
        }}
      />
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 520,
        background: 'var(--background)', zIndex: 200, overflowY: 'auto',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--background)', zIndex: 10,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, color: 'var(--text)' }}>Settlement Detail</h2>
            {data?.batch && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                {fmtPeriod(data.batch.period_start, data.batch.period_end)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface-2)', border: 'none', borderRadius: 8,
              width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: 'var(--text-2)',
            }}
          >✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
        ) : !data ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--error)' }}>Failed to load</div>
        ) : (
          <div style={{ padding: 24, flex: 1 }}>
            {/* Summary */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12, marginBottom: 24,
            }}>
              {[
                { label: 'Gross', value: fmtPaise(data.batch.gross_amount_paise), color: 'var(--text)' },
                { label: 'Commission', value: `−${fmtPaise(data.batch.commission_paise)}`, color: '#dc2626' },
                { label: 'Net', value: fmtPaise(data.batch.net_amount_paise), color: 'var(--primary)' },
              ].map(c => (
                <div key={c.label} style={{
                  background: 'var(--surface)', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Status + payment info */}
            <div style={{
              background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)',
              padding: '14px 16px', marginBottom: 24,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Status</span>
                <StatusBadge status={data.batch.status} />
              </div>
              {data.batch.status === 'paid' && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                    Paid on {fmtDate(data.batch.paid_at)}
                  </div>
                  {data.batch.payment_reference && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      Ref: <code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>
                        {data.batch.payment_reference}
                      </code>
                    </div>
                  )}
                </>
              )}
              {data.batch.status === 'pending' && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                  Payment will be transferred within 2 business days.
                </div>
              )}
            </div>

            {/* Line items table */}
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              Orders ({data.items?.length || 0})
            </h3>
            {!data.items?.length ? (
              <p style={{ color: 'var(--text-3)', fontSize: 13 }}>No order details available.</p>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      {['Order', 'Gross', 'Comm.', 'Net'].map(h => (
                        <th key={h} style={{
                          padding: '8px 10px', textAlign: h === 'Order' ? 'left' : 'right',
                          fontWeight: 600, color: 'var(--text-3)', fontSize: 11,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, i) => (
                      <tr key={item.id} style={{
                        borderTop: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'var(--background)' : 'var(--surface)',
                      }}>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontFamily: 'monospace' }}>
                          {item.orders?.order_number || item.order_id.slice(-8)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-2)' }}>
                          {fmtPaise(item.gross_amount_paise)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#dc2626' }}>
                          −{fmtPaise(item.commission_paise)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>
                          {fmtPaise(item.net_amount_paise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function SettlementsPage() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchMySettlements({ limit: 50 })
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load settlements'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const batches  = data?.batches || [];
  const summary  = data?.summary || {};

  // Last paid batch
  const lastPaid = batches.find(b => b.status === 'paid');

  // Pending total
  const pendingTotal = summary.pending_paise || 0;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          💰 Earnings &amp; Payouts
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4, marginBottom: 0 }}>
          Weekly settlements are processed every Monday. Payments arrive within 2 business days.
        </p>
      </div>

      {/* Summary Cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          {/* Pending */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '20px 22px',
            borderLeft: '4px solid #f59e0b',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Pending payout
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706', lineHeight: 1 }}>
              {fmtPaise(pendingTotal)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              Being processed
            </div>
          </div>

          {/* Last paid */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '20px 22px',
            borderLeft: '4px solid #16a34a',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Last payout
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>
              {lastPaid ? fmtPaise(lastPaid.net_amount_paise) : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              {lastPaid ? `Paid ${fmtDate(lastPaid.paid_at)}` : 'No payouts yet'}
            </div>
          </div>

          {/* Total earned */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '20px 22px',
            borderLeft: '4px solid var(--primary)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Total earned
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
              {fmtPaise(summary.total_earned_paise)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              All paid settlements
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            Settlement History
          </h2>
          <button
            onClick={load}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text-2)' }}
          >
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ height: 44, background: 'var(--surface-2)', borderRadius: 6, marginBottom: 8, animation: 'pulse 1.4s ease infinite' }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--error)' }}>
            {error}
            <button onClick={load} style={{ display: 'block', margin: '12px auto 0', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 18px', cursor: 'pointer', fontSize: 13 }}>
              Retry
            </button>
          </div>
        ) : !batches.length ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No settlements yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Your first settlement will appear after your first week of delivered orders.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Period', 'Orders', 'Net payout', 'Status', 'Paid on', ''].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 16px', textAlign: i >= 2 ? 'right' : 'left',
                      fontWeight: 600, fontSize: 11, color: 'var(--text-3)',
                      textTransform: 'uppercase', letterSpacing: 0.3,
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b, i) => (
                  <tr
                    key={b.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: i % 2 === 0 ? 'var(--background)' : 'var(--surface)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--background)' : 'var(--surface)'}
                  >
                    <td style={{ padding: '12px 16px', color: 'var(--text-2)', fontWeight: 500 }}>
                      {fmtPeriod(b.period_start, b.period_end)}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-3)' }}>
                      {b.order_count}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <CommissionRow batch={b} />
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <StatusBadge status={b.status} />
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-3)' }}>
                      {b.paid_at ? fmtDate(b.paid_at) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedId(b.id)}
                        style={{
                          background: 'transparent', border: '1px solid var(--border)',
                          borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                          fontSize: 11, color: 'var(--primary)', fontWeight: 600,
                        }}
                      >
                        Details →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <DetailDrawer batchId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
