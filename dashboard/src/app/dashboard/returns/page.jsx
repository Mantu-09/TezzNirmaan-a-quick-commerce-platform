'use client';
// ────────────────────────────────────────────────────────────
// Returns Queue Page — P6-3
// Route: /dashboard/returns
//
// Shop owner view for managing return requests:
//   1. Filter tabs: All / Pending / Resolved
//   2. Returns table with customer info, reason, status
//   3. Slide-in detail drawer: approve/reject with refund controls
// ────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { returnsApi } from '../../../lib/api';

// ── Helpers ───────────────────────────────────────────────────

const fmtPaise  = (p) => p ? `₹${((p) / 100).toFixed(0)}` : '—';
const fmtDate   = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtReason = (r) => r?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '—';

// ── Status badge ──────────────────────────────────────────────

const STATUS_STYLES = {
  requested:   { bg: 'rgba(245,158,11,0.12)', color: '#d97706', label: 'Pending' },
  under_review:{ bg: 'rgba(59,130,246,0.1)',  color: '#2563eb', label: 'Under Review' },
  approved:    { bg: 'rgba(99,102,241,0.12)', color: '#6366f1', label: 'Approved' },
  refunded:    { bg: 'rgba(22,163,74,0.1)',   color: '#16a34a', label: 'Refunded ✓' },
  rejected:    { bg: 'rgba(220,38,38,0.1)',   color: '#dc2626', label: 'Rejected' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.requested;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ── Approve drawer ────────────────────────────────────────────

function ApproveDrawer({ ret, onClose }) {
  const [amount,      setAmount]      = useState(ret.orders?.total_amount ? Math.round(ret.orders.total_amount / 100) : '');
  const [method,      setMethod]      = useState('wallet');
  const [rejectMode,  setRejectMode]  = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const qc = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: () => returnsApi.approve(ret.id, {
      refundAmountPaise: Math.round(amount * 100),
      refundMethod: method,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shop-returns'] }); onClose(); },
  });

  const rejectMutation = useMutation({
    mutationFn: () => returnsApi.reject(ret.id, { rejectionReason: rejectReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shop-returns'] }); onClose(); },
  });

  const alreadyResolved = ['approved', 'refunded', 'rejected'].includes(ret.status);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
    }}>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }}
      />

      {/* Drawer */}
      <div style={{
        width: 420, maxWidth: '100vw', height: '100vh', overflowY: 'auto',
        background: 'var(--surface)', padding: '24px 20px',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Return Request</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-2)' }}>×</button>
        </div>

        {/* Customer + Order */}
        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
          <div><strong>Order:</strong> #{ret.orders?.order_number || '—'}</div>
          <div style={{ marginTop: 4 }}><strong>Customer:</strong> {ret.profiles?.full_name || '—'} · {ret.profiles?.phone || ''}</div>
          <div style={{ marginTop: 4 }}><strong>Reason:</strong> {fmtReason(ret.reason)}</div>
          <div style={{ marginTop: 4 }}><strong>Submitted:</strong> {fmtDate(ret.requested_at)}</div>
          {ret.description && (
            <div style={{ marginTop: 8, color: 'var(--text-2)', lineHeight: 1.5 }}>{ret.description}</div>
          )}
        </div>

        {/* Photos */}
        {ret.photo_urls?.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
              PHOTOS ({ret.photo_urls.length})
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ret.photo_urls.map((url, i) => (
                <a href={url} target="_blank" rel="noreferrer" key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url} alt={`Return photo ${i + 1}`}
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Status:</span>
          <StatusBadge status={ret.status} />
        </div>

        {/* ── Rejection view ─── */}
        {ret.status === 'rejected' && ret.rejection_reason && (
          <div style={{ background: 'rgba(220,38,38,0.08)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
            Rejected: {ret.rejection_reason}
          </div>
        )}

        {/* ── Refund view ─── */}
        {(ret.status === 'approved' || ret.status === 'refunded') && (
          <div style={{ background: 'rgba(22,163,74,0.08)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
            Refund: <strong>{fmtPaise(ret.refund_amount_paise)}</strong> via {ret.refund_method === 'wallet' ? 'Wallet (instant)' : 'Bank (5–7 days)'}
          </div>
        )}

        {/* ── Action controls (pending / under_review only) ─── */}
        {!alreadyResolved && !rejectMode && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />
            <h4 style={{ margin: 0, fontSize: 14 }}>Issue refund</h4>

            {/* Refund amount */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                REFUND AMOUNT (₹)
              </label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 150"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              {ret.orders?.total_amount && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Order total: {fmtPaise(ret.orders.total_amount)}
                </div>
              )}
            </div>

            {/* Refund method */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                REFUND VIA
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { value: 'wallet',                   label: '💳 Wallet',       sub: 'Instant' },
                  { value: 'original_payment_method',  label: '🏦 Bank',         sub: '5–7 days' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setMethod(opt.value)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                      border: `2px solid ${method === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                      background: method === opt.value ? 'var(--primary-10, rgba(99,102,241,0.08))' : 'var(--surface)',
                      color: method === opt.value ? 'var(--primary)' : 'var(--text-2)',
                      fontWeight: method === opt.value ? 700 : 400,
                      fontSize: 13, textAlign: 'center',
                    }}
                  >
                    <div>{opt.label}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={!amount || approveMutation.isPending}
                className="btn"
                style={{ flex: 1, background: 'var(--success)', color: '#fff', border: 'none', padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
              >
                {approveMutation.isPending ? 'Approving…' : '✓ Approve & Refund'}
              </button>
              <button
                onClick={() => setRejectMode(true)}
                className="btn"
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--error)', color: 'var(--error)', background: 'transparent', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
              >
                Reject
              </button>
            </div>

            {approveMutation.isError && (
              <div style={{ fontSize: 12, color: 'var(--error)' }}>
                Error: {approveMutation.error?.message}
              </div>
            )}
          </>
        )}

        {/* Reject form */}
        {!alreadyResolved && rejectMode && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />
            <h4 style={{ margin: 0, fontSize: 14, color: 'var(--error)' }}>Reject return</h4>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Explain why the return is being rejected (sent to customer)"
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', fontSize: 14, resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => rejectMutation.mutate()}
                disabled={rejectReason.length < 5 || rejectMutation.isPending}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                  background: 'var(--error)', color: '#fff', border: 'none',
                  fontWeight: 700, fontSize: 14,
                }}
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
              <button
                onClick={() => setRejectMode(false)}
                style={{
                  padding: '10px 16px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'transparent',
                  cursor: 'pointer', color: 'var(--text-2)', fontSize: 14,
                }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Filter tabs ───────────────────────────────────────────────

const FILTERS = [
  { label: 'Pending',   value: 'requested' },
  { label: 'All',       value: '' },
  { label: 'Resolved',  value: 'refunded' },
  { label: 'Rejected',  value: 'rejected' },
];

// ── Main Page ─────────────────────────────────────────────────

export default function ReturnsPage() {
  const [filterStatus, setFilterStatus] = useState('requested');
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shop-returns', filterStatus, page],
    queryFn:  () => returnsApi.getReturns({ status: filterStatus || undefined, page, limit: 20 }),
    keepPreviousData: true,
  });

  const returns = data?.data?.returns || [];
  const total   = data?.data?.total   || 0;
  const pages   = Math.ceil(total / 20);

  const handleFilterChange = useCallback((v) => {
    setFilterStatus(v);
    setPage(1);
  }, []);

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🔄 Returns Queue</h1>
          <p className="page-subtitle">Review and action customer return requests</p>
        </div>
        {total > 0 && (
          <span style={{
            background: 'rgba(245,158,11,0.15)', color: '#d97706',
            borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 700,
          }}>
            {total} request{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Filter tabs ─────────────────────────────────────── */}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            className={`tab-btn${filterStatus === f.value ? ' active' : ''}`}
            onClick={() => handleFilterChange(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      {isLoading ? (
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>Loading returns…</p>
        </div>
      ) : isError ? (
        <div className="empty-state">
          <p style={{ color: 'var(--error)' }}>Failed to load returns. Please refresh.</p>
        </div>
      ) : returns.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h3>No returns here</h3>
          <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
            {filterStatus === 'requested'
              ? 'No pending return requests — great news!'
              : 'No returns match this filter.'}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {['Order', 'Customer', 'Reason', 'Requested', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {returns.map((ret, i) => (
                <tr
                  key={ret.id}
                  onClick={() => setSelectedReturn(ret)}
                  style={{
                    borderBottom: i < returns.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>
                    #{ret.orders?.order_number || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    <div>{ret.profiles?.full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{ret.profiles?.phone || ''}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                    {fmtReason(ret.reason)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {fmtDate(ret.requested_at)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge status={ret.status} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
                      View →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                Page {page} of {pages} ({total} total)
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-sm"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  ← Prev
                </button>
                <button
                  className="btn btn-sm"
                  disabled={page >= pages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detail drawer ────────────────────────────────────── */}
      {selectedReturn && (
        <ApproveDrawer
          ret={selectedReturn}
          onClose={() => setSelectedReturn(null)}
        />
      )}
    </div>
  );
}
