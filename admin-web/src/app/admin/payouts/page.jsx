'use client';
// ────────────────────────────────────────────────────────────
// /admin/payouts — P10-5
// Admin Rider Payout Management
//
// Features:
//  • Filter: All | Pending | Processing | Paid | Rejected | Failed
//  • Per-row Approve (Pay ✓) and Reject buttons
//  • Process All Pending — sequential with 500ms gap
//  • RazorpayX account balance display
//  • Pending count badge in sidebar (consumed from layout)
//  • Optimistic UI: status updates instantly, rolls back on error
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react';
import { payoutsApi } from '../../../lib/api';

// ── Helpers ────────────────────────────────────────────────
function fmt(paise) {
  if (paise == null) return '—';
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function riderName(req) {
  return req.riders?.profiles?.full_name || req.riders?.profiles?.phone || 'Unknown';
}

function bankLabel(req) {
  const fa = Array.isArray(req.rider_fund_accounts)
    ? req.rider_fund_accounts[0]
    : req.rider_fund_accounts;
  if (!fa) return <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>No account</span>;
  return (
    <span>
      <span style={{ fontWeight: 600 }}>{fa.bank_name || fa.ifsc_code || 'Bank'}</span>
      {fa.account_number_last4 && (
        <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>
          ****{fa.account_number_last4}
        </span>
      )}
    </span>
  );
}

// ── Status Badge ───────────────────────────────────────────
const STATUS_CONFIG = {
  pending:    { bg: 'rgba(217,119,6,0.12)',  color: '#d97706', border: 'rgba(217,119,6,0.25)',  label: 'Pending' },
  processing: { bg: 'rgba(37,99,235,0.12)',  color: '#2563eb', border: 'rgba(37,99,235,0.25)',  label: 'Processing' },
  paid:       { bg: 'rgba(22,163,74,0.12)',  color: '#16a34a', border: 'rgba(22,163,74,0.25)',  label: 'Paid ✓' },
  rejected:   { bg: 'rgba(220,38,38,0.12)',  color: '#dc2626', border: 'rgba(220,38,38,0.25)',  label: 'Rejected' },
  failed:     { bg: 'rgba(220,38,38,0.12)',  color: '#dc2626', border: 'rgba(220,38,38,0.25)',  label: 'Failed' },
  reversed:   { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', border: 'rgba(107,114,128,0.2)', label: 'Reversed' },
};

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span style={{
      display:         'inline-flex',
      alignItems:      'center',
      padding:         '3px 10px',
      borderRadius:    20,
      fontSize:        11,
      fontWeight:      700,
      letterSpacing:   0.4,
      textTransform:   'uppercase',
      background:      c.bg,
      color:           c.color,
      border:          `1px solid ${c.border}`,
      whiteSpace:      'nowrap',
    }}>
      {c.label}
    </span>
  );
}

// ── Reject Modal ───────────────────────────────────────────
function RejectModal({ request, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  return (
    <div style={{
      position:        'fixed',
      inset:           0,
      background:      'rgba(0,0,0,0.55)',
      zIndex:          200,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         24,
      backdropFilter:  'blur(4px)',
    }}>
      <div style={{
        background:   'var(--surface)',
        borderRadius: 16,
        padding:      28,
        width:        '100%',
        maxWidth:     440,
        boxShadow:    '0 20px 60px rgba(0,0,0,0.3)',
        border:       '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
          Reject Payout Request
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-3)' }}>
          {riderName(request)} · {fmt(request.amount_paise)}
        </p>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
          Reason <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <textarea
          ref={inputRef}
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Insufficient earnings, bank account not set up…"
          style={{
            width:        '100%',
            padding:      '10px 12px',
            borderRadius: 8,
            border:       '1.5px solid var(--border)',
            background:   'var(--bg)',
            color:        'var(--text)',
            fontSize:     13,
            resize:       'vertical',
            outline:      'none',
            boxSizing:    'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding:      '8px 18px',
              borderRadius: 8,
              border:       '1px solid var(--border)',
              background:   'transparent',
              color:        'var(--text-2)',
              fontSize:     13,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={loading || !reason.trim()}
            style={{
              padding:      '8px 18px',
              borderRadius: 8,
              border:       'none',
              background:   '#dc2626',
              color:        '#fff',
              fontSize:     13,
              fontWeight:   700,
              cursor:       loading || !reason.trim() ? 'not-allowed' : 'pointer',
              opacity:      loading || !reason.trim() ? 0.65 : 1,
            }}
          >
            {loading ? 'Rejecting…' : 'Reject Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton Row ───────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[1,2,3,4,5,6].map(i => (
        <td key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            height:          13,
            borderRadius:    6,
            background:      'linear-gradient(90deg,var(--surface-2) 25%,var(--border) 50%,var(--surface-2) 75%)',
            backgroundSize:  '200% 100%',
            animation:       'shimmer 1.4s infinite',
            width:           i === 5 ? 80 : '100%',
          }} />
        </td>
      ))}
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────
const FILTERS = ['all', 'pending', 'processing', 'paid', 'rejected', 'failed'];

export default function AdminPayoutsPage() {
  const [requests,      setRequests]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [filter,        setFilter]        = useState('all');
  const [balance,       setBalance]       = useState(null);
  const [balanceLoading,setBalanceLoading]= useState(true);
  const [pendingCount,  setPendingCount]  = useState(0);
  const [pendingTotal,  setPendingTotal]  = useState(0);
  const [processing,    setProcessing]    = useState(new Set()); // IDs being processed
  const [toastMsg,      setToastMsg]      = useState('');
  const [toastType,     setToastType]     = useState('success'); // 'success' | 'error'
  const [rejectTarget,  setRejectTarget]  = useState(null);      // request being rejected
  const [rejectLoading, setRejectLoading] = useState(false);
  const [processAllRunning, setProcessAllRunning] = useState(false);

  // ── Toast ───────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(''), 4000);
  }, []);

  // ── Load payout requests ────────────────────────────────
  const loadRequests = useCallback(async (statusFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      const res  = await payoutsApi.listPending({
        status: statusFilter,
        limit:  100,
      });
      setRequests(res.data?.requests     || []);
      setPendingCount(res.data?.pending_count       || 0);
      setPendingTotal(res.data?.total_pending_paise || 0);
    } catch (err) {
      setError(err.message || 'Failed to load payout requests');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // ── Load balance ────────────────────────────────────────
  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await payoutsApi.getBalance();
      setBalance(res.data || null);
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(filter); }, [filter]);
  useEffect(() => { loadBalance(); }, []);

  // ── Approve single ──────────────────────────────────────
  const handleApprove = useCallback(async (req) => {
    if (processing.has(req.id)) return;
    setProcessing(p => new Set(p).add(req.id));

    // Optimistic: mark as processing
    setRequests(prev => prev.map(r =>
      r.id === req.id ? { ...r, status: 'processing' } : r
    ));

    try {
      await payoutsApi.approve(req.id);
      showToast(`✓ Payment initiated for ${riderName(req)} — ${fmt(req.amount_paise)}`);
      // Refresh to get real status
      await loadRequests(filter);
      await loadBalance();
    } catch (err) {
      // Roll back
      setRequests(prev => prev.map(r =>
        r.id === req.id ? { ...r, status: 'pending' } : r
      ));
      showToast(`✗ ${err.message || 'Approval failed'}`, 'error');
    } finally {
      setProcessing(p => { const s = new Set(p); s.delete(req.id); return s; });
    }
  }, [processing, filter, loadRequests, loadBalance, showToast]);

  // ── Reject single ───────────────────────────────────────
  const handleReject = useCallback(async (reason) => {
    if (!rejectTarget) return;
    setRejectLoading(true);
    try {
      await payoutsApi.reject(rejectTarget.id, reason);
      showToast(`Rejected payout for ${riderName(rejectTarget)}.`);
      setRejectTarget(null);
      await loadRequests(filter);
    } catch (err) {
      showToast(`✗ ${err.message || 'Rejection failed'}`, 'error');
    } finally {
      setRejectLoading(false);
    }
  }, [rejectTarget, filter, loadRequests, showToast]);

  // ── Process All ─────────────────────────────────────────
  const handleProcessAll = useCallback(async () => {
    // P11-0 Fix 4: Cap at 50 to avoid RazorpayX rate limits on large batches
    const MAX_PROCESS_ALL = 50;
    const pending = requests.filter(r => r.status === 'pending').slice(0, MAX_PROCESS_ALL);
    if (!pending.length) return;

    const totalPending = requests.filter(r => r.status === 'pending').length;
    const confirmed = window.confirm(
      `Process ${pending.length} pending payout${pending.length > 1 ? 's' : ''}?\nTotal: ${fmt(pendingTotal)}\n\nThis will initiate ${pending.length} RazorpayX transfer${pending.length > 1 ? 's' : ''}.`
    );
    if (!confirmed) return;

    if (totalPending > MAX_PROCESS_ALL) {
      showToast(`Processing first ${MAX_PROCESS_ALL} payouts. Run again for the remaining ${totalPending - MAX_PROCESS_ALL}.`);
    }

    setProcessAllRunning(true);
    let successCount = 0;
    let failCount    = 0;

    for (const req of pending) {
      try {
        setProcessing(p => new Set(p).add(req.id));
        setRequests(prev => prev.map(r =>
          r.id === req.id ? { ...r, status: 'processing' } : r
        ));
        await payoutsApi.approve(req.id);
        successCount++;
      } catch {
        failCount++;
        setRequests(prev => prev.map(r =>
          r.id === req.id ? { ...r, status: 'pending' } : r
        ));
      } finally {
        setProcessing(p => { const s = new Set(p); s.delete(req.id); return s; });
      }
      // 500ms delay between requests to respect RazorpayX rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    setProcessAllRunning(false);
    showToast(
      `Processed ${successCount} payout${successCount !== 1 ? 's' : ''}${failCount ? ` · ${failCount} failed` : ''}`,
      failCount > 0 ? 'error' : 'success'
    );
    await loadRequests(filter);
    await loadBalance();
  }, [requests, pendingTotal, filter, loadRequests, loadBalance, showToast]);

  const pendingRequests = requests.filter(r => r.status === 'pending');

  return (
    <div>
      {/* ── Toast ─────────────────────────────────────── */}
      {toastMsg && (
        <div style={{
          position:    'fixed',
          bottom:      28,
          right:       28,
          zIndex:      300,
          background:  toastType === 'success' ? '#16a34a' : '#dc2626',
          color:       '#fff',
          padding:     '12px 20px',
          borderRadius: 10,
          fontWeight:  600,
          fontSize:    14,
          boxShadow:   '0 8px 32px rgba(0,0,0,0.25)',
          maxWidth:    380,
          animation:   'fadeInUp 0.2s ease',
        }}>
          {toastMsg}
        </div>
      )}

      {/* ── Reject Modal ───────────────────────────────── */}
      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          loading={rejectLoading}
          onConfirm={handleReject}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {/* ── Page Header ────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   24,
        flexWrap:       'wrap',
        gap:            12,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
            Rider Payout Requests
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            Review and approve rider earnings transfers via RazorpayX
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Process All */}
          {pendingRequests.length > 0 && (
            <button
              onClick={handleProcessAll}
              disabled={processAllRunning}
              id="process-all-payouts-btn"
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          8,
                padding:      '9px 18px',
                borderRadius: 10,
                border:       'none',
                background:   processAllRunning
                  ? 'var(--surface-2)'
                  : 'linear-gradient(135deg, #16a34a, #15803d)',
                color:        processAllRunning ? 'var(--text-3)' : '#fff',
                fontWeight:   700,
                fontSize:     13,
                cursor:       processAllRunning ? 'not-allowed' : 'pointer',
                boxShadow:    processAllRunning ? 'none' : '0 2px 8px rgba(22,163,74,0.3)',
                transition:   'all 0.15s',
              }}
            >
              {processAllRunning ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                  Processing…
                </>
              ) : (
                <>💸 Process All ({pendingRequests.length})</>
              )}
            </button>
          )}
          {/* Refresh */}
          <button
            onClick={() => { loadRequests(filter); loadBalance(); }}
            disabled={loading}
            id="refresh-payouts-btn"
            style={{
              padding:      '9px 14px',
              borderRadius: 10,
              border:       '1px solid var(--border)',
              background:   'var(--surface)',
              color:        'var(--text-2)',
              fontWeight:   600,
              fontSize:     13,
              cursor:       'pointer',
              transition:   'all 0.15s',
            }}
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
        {/* Pending count */}
        <div style={{
          background:   'var(--surface)',
          borderRadius: 12,
          padding:      '16px 20px',
          border:       '1px solid var(--border)',
          boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            Pending Requests
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: pendingCount > 0 ? '#d97706' : 'var(--text)' }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {fmt(pendingTotal)} total
          </div>
        </div>

        {/* RazorpayX Balance */}
        <div style={{
          background:   'var(--surface)',
          borderRadius: 12,
          padding:      '16px 20px',
          border:       '1px solid var(--border)',
          boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            RazorpayX Balance
          </div>
          {balanceLoading ? (
            <div style={{ height: 26, width: 100, borderRadius: 6, background: 'var(--surface-2)', animation: 'shimmer 1.4s infinite' }} />
          ) : balance?.balance_paise != null ? (
            <div style={{ fontSize: 26, fontWeight: 800, color: balance.balance_paise < pendingTotal ? '#dc2626' : '#16a34a' }}>
              {fmt(balance.balance_paise)}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>
              {balance?.configured === false ? 'Not configured' : 'Unavailable'}
            </div>
          )}
          {balance?.balance_paise != null && balance.balance_paise < pendingTotal && (
            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2, fontWeight: 600 }}>
              ⚠ Low — top up RazorpayX before processing
            </div>
          )}
        </div>
      </div>

      {/* ── Filter Tabs ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding:      '6px 14px',
              borderRadius: 8,
              border:       '1px solid',
              borderColor:  filter === f ? 'var(--primary)' : 'var(--border)',
              background:   filter === f ? 'var(--primary)' : 'var(--surface)',
              color:        filter === f ? '#fff' : 'var(--text-2)',
              fontSize:     12,
              fontWeight:   600,
              cursor:       'pointer',
              textTransform:'capitalize',
              transition:   'all 0.12s',
            }}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && pendingCount > 0 && (
              <span style={{
                marginLeft:      6,
                background:      '#d97706',
                color:           '#fff',
                borderRadius:    10,
                padding:         '1px 7px',
                fontSize:        10,
                fontWeight:      800,
              }}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Error ───────────────────────────────────────── */}
      {error && (
        <div style={{
          padding:      '12px 16px',
          borderRadius: 10,
          background:   'rgba(220,38,38,0.08)',
          border:       '1px solid rgba(220,38,38,0.2)',
          color:        '#dc2626',
          fontSize:     13,
          marginBottom: 16,
        }}>
          {error}
          <button onClick={() => loadRequests(filter)} style={{ marginLeft: 12, fontWeight: 700, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────── */}
      <div style={{
        background:   'var(--surface)',
        borderRadius: 14,
        border:       '1px solid var(--border)',
        overflow:     'hidden',
        boxShadow:    '0 1px 6px rgba(0,0,0,0.06)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {['Rider', 'Amount', 'Bank Account', 'Requested', 'Status', 'Actions'].map(h => (
                <th key={h} style={{
                  padding:     '11px 16px',
                  textAlign:   h === 'Amount' || h === 'Actions' ? 'right' : 'left',
                  fontSize:    11,
                  fontWeight:  700,
                  color:       'var(--text-3)',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  borderBottom: '1px solid var(--border)',
                  whiteSpace:  'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
                  {filter === 'pending'
                    ? '🎉 No pending payout requests. All riders have been paid!'
                    : `No ${filter === 'all' ? '' : filter} payout requests found.`}
                </td>
              </tr>
            ) : (
              requests.map((req) => {
                const isProcessing  = processing.has(req.id);
                const canApprove    = req.status === 'pending' && !isProcessing;
                const canReject     = req.status === 'pending' && !isProcessing;
                const hasFundAcct   = Array.isArray(req.rider_fund_accounts)
                  ? req.rider_fund_accounts.length > 0 && req.rider_fund_accounts[0]?.razorpay_fund_account_id
                  : req.rider_fund_accounts?.razorpay_fund_account_id;

                return (
                  <tr
                    key={req.id}
                    style={{
                      borderBottom:   '1px solid var(--border)',
                      background:     isProcessing ? 'rgba(37,99,235,0.04)' : 'transparent',
                      transition:     'background 0.15s',
                    }}
                  >
                    {/* Rider */}
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>
                        {riderName(req)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        {req.riders?.profiles?.phone || '—'}
                      </div>
                    </td>

                    {/* Amount */}
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                        {fmt(req.amount_paise)}
                      </span>
                    </td>

                    {/* Bank */}
                    <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                      {bankLabel(req)}
                    </td>

                    {/* Requested */}
                    <td style={{ padding: '13px 16px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {timeAgo(req.created_at)}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '13px 16px' }}>
                      {isProcessing
                        ? <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>⟳ Initiating…</span>
                        : <StatusBadge status={req.status} />
                      }
                      {req.notes && req.status === 'rejected' && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                          {req.notes}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {canApprove && (
                          <button
                            onClick={() => handleApprove(req)}
                            disabled={!hasFundAcct || isProcessing}
                            id={`approve-payout-${req.id}`}
                            title={!hasFundAcct ? 'Rider has no bank account registered' : 'Approve and initiate payment'}
                            style={{
                              padding:      '6px 14px',
                              borderRadius: 8,
                              border:       'none',
                              background:   !hasFundAcct
                                ? 'var(--surface-2)'
                                : 'linear-gradient(135deg, #16a34a, #15803d)',
                              color:        !hasFundAcct ? 'var(--text-3)' : '#fff',
                              fontWeight:   700,
                              fontSize:     12,
                              cursor:       !hasFundAcct ? 'not-allowed' : 'pointer',
                              boxShadow:    !hasFundAcct ? 'none' : '0 1px 4px rgba(22,163,74,0.25)',
                              whiteSpace:   'nowrap',
                              transition:   'all 0.12s',
                            }}
                          >
                            Pay ✓
                          </button>
                        )}
                        {canReject && (
                          <button
                            onClick={() => setRejectTarget(req)}
                            id={`reject-payout-${req.id}`}
                            style={{
                              padding:      '6px 14px',
                              borderRadius: 8,
                              border:       '1px solid rgba(220,38,38,0.3)',
                              background:   'rgba(220,38,38,0.06)',
                              color:        '#dc2626',
                              fontWeight:   700,
                              fontSize:     12,
                              cursor:       'pointer',
                              whiteSpace:   'nowrap',
                              transition:   'all 0.12s',
                            }}
                          >
                            Reject
                          </button>
                        )}
                        {!canApprove && !canReject && (
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer summary */}
        {!loading && requests.length > 0 && (
          <div style={{
            padding:        '12px 20px',
            borderTop:      '1px solid var(--border)',
            background:     'var(--surface-2)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            flexWrap:       'wrap',
            gap:            8,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {requests.length} request{requests.length !== 1 ? 's' : ''} shown
            </span>
            {pendingCount > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706' }}>
                Total pending: {fmt(pendingTotal)} ({pendingCount} request{pendingCount !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Animations ────────────────────────────────────────── */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
