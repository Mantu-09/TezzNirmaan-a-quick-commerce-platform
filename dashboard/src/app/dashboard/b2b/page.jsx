'use client';
// ────────────────────────────────────────────────────────────
// B2B Contractor Management — P6-6
// Route: /dashboard/b2b
//
// Admin view for:
//   1. Pending contractor applications → approve (set credit + terms + discount)
//   2. Verified contractor accounts → manage credit limits
//   3. Overdue credit accounts → mark paid
// ────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';

// ── Helpers ───────────────────────────────────────────────────

const fmtPaise = (p) => p ? `₹${Math.round(p / 100).toLocaleString('en-IN')}` : '₹0';
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const PAYMENT_STATUS_STYLES = {
  pending:  { bg: 'rgba(245,158,11,0.12)', color: '#d97706', label: 'Pending' },
  paid:     { bg: 'rgba(22,163,74,0.1)',   color: '#16a34a', label: 'Paid ✓' },
  overdue:  { bg: 'rgba(220,38,38,0.1)',   color: '#dc2626', label: 'Overdue' },
};

function Badge({ status }) {
  const s = PAYMENT_STATUS_STYLES[status] || PAYMENT_STATUS_STYLES.pending;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Approve drawer ────────────────────────────────────────────

function ApproveDrawer({ application, onClose }) {
  const qc = useQueryClient();
  const [creditLimitRupees, setCreditLimit]   = useState(50000);
  const [paymentTermsDays,  setTerms]         = useState(7);
  const [discountPercent,   setDiscount]      = useState(2.5);
  const [submitting,        setSubmitting]    = useState(false);
  const [error,             setError]         = useState(null);

  const handleApprove = async () => {
    setSubmitting(true); setError(null);
    try {
      await apiClient.patch(`/admin/b2b/applications/${application.id}/approve`, {
        creditLimitPaise:  creditLimitRupees * 100,
        paymentTermsDays,
        discountPercent,
      });
      qc.invalidateQueries({ queryKey: ['b2b-applications'] });
      qc.invalidateQueries({ queryKey: ['b2b-outstanding'] });
      onClose();
    } catch (e) {
      setError(e.message || 'Approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={drawerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Approve Contractor</h3>
        <button onClick={onClose} style={iconBtnStyle}>✕</button>
      </div>

      {/* Applicant info */}
      <div style={infoBox}>
        <div style={infoRow}>
          <span style={infoLabel}>Company</span>
          <span style={infoVal}>{application.company_name}</span>
        </div>
        <div style={infoRow}>
          <span style={infoLabel}>Contact</span>
          <span style={infoVal}>{application.profiles?.full_name} · {application.profiles?.phone}</span>
        </div>
        {application.gst_number && (
          <div style={infoRow}>
            <span style={infoLabel}>GST</span>
            <span style={infoVal}>{application.gst_number}</span>
          </div>
        )}
        <div style={infoRow}>
          <span style={infoLabel}>Volume</span>
          <span style={infoVal}>{application.monthly_volume_band?.replace(/_/g, ' ') || '—'}</span>
        </div>
        <div style={infoRow}>
          <span style={infoLabel}>Requested Terms</span>
          <span style={infoVal}>{application.payment_terms_days === 0 ? 'Cash only' : `Net ${application.payment_terms_days}d`}</span>
        </div>
      </div>

      {/* Credit terms */}
      <div style={{ marginBottom: 20 }}>
        <label style={fieldLabel}>Credit Limit (₹)</label>
        <input
          type="number"
          value={creditLimitRupees}
          onChange={e => setCreditLimit(+e.target.value)}
          style={inputStyle}
          min={0}
          step={10000}
        />
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>₹0 = cash only account</div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={fieldLabel}>Payment Terms (days)</label>
        <select value={paymentTermsDays} onChange={e => setTerms(+e.target.value)} style={inputStyle}>
          <option value={0}>Cash only (0)</option>
          <option value={7}>Net 7 days</option>
          <option value={15}>Net 15 days</option>
          <option value={30}>Net 30 days</option>
        </select>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={fieldLabel}>Volume Discount (%)</label>
        <input
          type="number"
          value={discountPercent}
          onChange={e => setDiscount(+e.target.value)}
          style={inputStyle}
          min={0}
          max={25}
          step={0.5}
        />
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <button onClick={handleApprove} disabled={submitting} style={approveBtn}>
        {submitting ? 'Approving…' : 'Approve & Set Terms'}
      </button>
    </div>
  );
}

// ── Reject drawer ─────────────────────────────────────────────

function RejectDrawer({ application, onClose }) {
  const qc = useQueryClient();
  const [reason,     setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const handleReject = async () => {
    if (!reason.trim()) { setError('Please enter a rejection reason.'); return; }
    setSubmitting(true); setError(null);
    try {
      await apiClient.patch(`/admin/b2b/applications/${application.id}/reject`, { reason });
      qc.invalidateQueries({ queryKey: ['b2b-applications'] });
      onClose();
    } catch (e) {
      setError(e.message || 'Rejection failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={drawerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Reject Application</h3>
        <button onClick={onClose} style={iconBtnStyle}>✕</button>
      </div>
      <div style={infoBox}>
        <strong>{application.company_name}</strong>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{application.profiles?.full_name}</div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={fieldLabel}>Rejection Reason</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. Unable to verify GST registration"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>
      {error && <div style={errorBox}>{error}</div>}
      <button onClick={handleReject} disabled={submitting} style={rejectBtn}>
        {submitting ? 'Rejecting…' : 'Reject Application'}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

const TABS = [
  { key: 'pending',  label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'overdue',  label: 'Overdue Credit' },
];

export default function B2BPage() {
  const qc           = useQueryClient();
  const [tab,        setTab]        = useState('pending');
  const [approveApp, setApproveApp] = useState(null);
  const [rejectApp,  setRejectApp]  = useState(null);

  // Applications (pending / verified / rejected)
  const { data: appData, isLoading: appLoading } = useQuery({
    queryKey: ['b2b-applications', tab],
    queryFn:  () => tab !== 'overdue'
      ? apiClient.get(`/admin/b2b/applications?status=${tab}`)
      : null,
    enabled:  tab !== 'overdue',
  });

  // Overdue credit accounts
  const { data: overdueData, isLoading: overdueLoading } = useQuery({
    queryKey: ['b2b-outstanding'],
    queryFn:  () => apiClient.get('/admin/b2b/outstanding'),
    enabled:  tab === 'overdue',
  });

  const applications = appData?.applications || [];
  const overdueItems = overdueData?.overdue   || [];
  const isLoading    = appLoading || overdueLoading;

  // Mark paid
  const { mutate: markPaid } = useMutation({
    mutationFn: (b2bOrderId) => apiClient.patch(`/admin/b2b/orders/${b2bOrderId}/paid`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['b2b-outstanding'] }),
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 32, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Overlay */}
      {(approveApp || rejectApp) && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
          onClick={() => { setApproveApp(null); setRejectApp(null); }}
        />
      )}

      {/* Drawers */}
      {approveApp && <ApproveDrawer application={approveApp} onClose={() => setApproveApp(null)} />}
      {rejectApp  && <RejectDrawer  application={rejectApp}  onClose={() => setRejectApp(null)} />}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0 }}>🏢 B2B Contractor Accounts</h1>
        <p style={{ color: '#64748b', fontSize: 14, margin: '6px 0 0' }}>
          Manage contractor applications, credit limits, and GST invoicing.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: tab === t.key ? '#4f46e5' : '#fff',
              color:      tab === t.key ? '#fff'    : '#334155',
              boxShadow: tab === t.key ? '0 2px 8px rgba(79,70,229,0.3)' : '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</div>
      )}

      {/* Applications table */}
      {!isLoading && tab !== 'overdue' && (
        applications.length === 0 ? (
          <div style={emptyBox}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, color: '#334155' }}>No {tab} applications</div>
          </div>
        ) : (
          <div style={tableCard}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  {['Company', 'Contact', 'GST / PAN', 'Volume', 'Requested Terms', 'Applied', tab === 'verified' ? 'Credit Limit' : 'Status', 'Actions'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {applications.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{a.company_name}</div>
                    </td>
                    <td style={tdStyle}>
                      <div>{a.profiles?.full_name || '—'}</div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{a.profiles?.phone}</div>
                    </td>
                    <td style={tdStyle}>
                      <div>{a.gst_number || '—'}</div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{a.pan_number || '—'}</div>
                    </td>
                    <td style={tdStyle}>{a.monthly_volume_band?.replace(/_/g, ' ') || '—'}</td>
                    <td style={tdStyle}>{a.payment_terms_days === 0 ? 'Cash only' : `Net ${a.payment_terms_days}d`}</td>
                    <td style={tdStyle}>{fmtDate(a.created_at)}</td>
                    <td style={tdStyle}>
                      {tab === 'verified'
                        ? <span style={{ fontWeight: 700, color: '#4f46e5' }}>{fmtPaise(a.credit_limit_paise)}</span>
                        : tab === 'rejected'
                        ? <span style={{ color: '#dc2626', fontSize: 12 }}>{a.rejection_reason}</span>
                        : <Badge status="pending" />
                      }
                    </td>
                    <td style={tdStyle}>
                      {tab === 'pending' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setApproveApp(a)} style={actionApprove}>Approve</button>
                          <button onClick={() => setRejectApp(a)}  style={actionReject}>Reject</button>
                        </div>
                      )}
                      {tab === 'rejected' && (
                        <button onClick={() => setApproveApp(a)} style={actionApprove}>Re-approve</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Overdue credit accounts */}
      {!isLoading && tab === 'overdue' && (
        overdueItems.length === 0 ? (
          <div style={emptyBox}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 600, color: '#334155' }}>No overdue credit accounts</div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>All contractor payments are up to date.</div>
          </div>
        ) : (
          <div style={tableCard}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  {['Company', 'Contact', 'Order', 'Amount', 'Due Date', 'Days Overdue', 'Status', 'Action'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overdueItems.map(item => {
                  const dueDate     = item.due_date ? new Date(item.due_date) : null;
                  const today       = new Date();
                  const daysOverdue = dueDate ? Math.max(0, Math.floor((today - dueDate) / 86400000)) : 0;
                  const contractor  = item.contractor_profiles;
                  const order       = item.orders;

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{contractor?.company_name || '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                          Outstanding: {fmtPaise(contractor?.outstanding_credit_paise)}
                        </div>
                      </td>
                      <td style={tdStyle}>{contractor?.profiles?.full_name} · {contractor?.profiles?.phone}</td>
                      <td style={tdStyle}>{order?.order_number || '—'}</td>
                      <td style={tdStyle}>{fmtPaise(order?.total_amount_paise)}</td>
                      <td style={tdStyle}>{fmtDate(item.due_date)}</td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 700, color: daysOverdue > 14 ? '#dc2626' : '#d97706' }}>
                          {daysOverdue}d
                        </span>
                      </td>
                      <td style={tdStyle}><Badge status={item.payment_status} /></td>
                      <td style={tdStyle}>
                        <button onClick={() => markPaid(item.id)} style={actionApprove}>
                          Mark Paid
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ── Inline styles ─────────────────────────────────────────────

const tableCard = {
  background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden',
};
const thStyle = {
  padding: '12px 16px', textAlign: 'left', fontWeight: 700,
  fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5,
};
const tdStyle = { padding: '14px 16px', verticalAlign: 'top', color: '#334155' };
const emptyBox = {
  background: '#fff', borderRadius: 16, padding: 64,
  textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};
const drawerStyle = {
  position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
  background: '#fff', zIndex: 50, padding: 32,
  boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
  overflowY: 'auto',
};
const iconBtnStyle = {
  background: 'none', border: 'none', fontSize: 18,
  cursor: 'pointer', color: '#94a3b8', padding: 4,
};
const infoBox = {
  background: '#f8fafc', borderRadius: 12, padding: 16,
  marginBottom: 24, border: '1px solid #e2e8f0',
};
const infoRow = { display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 };
const infoLabel = { color: '#64748b', fontWeight: 500 };
const infoVal   = { color: '#0f172a', fontWeight: 600 };
const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 };
const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1px solid #e2e8f0', fontSize: 14, color: '#0f172a',
  background: '#f8fafc', outline: 'none', boxSizing: 'border-box',
};
const errorBox  = { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: 12, fontSize: 13, color: '#dc2626', marginBottom: 16 };
const approveBtn = { width: '100%', padding: '12px 0', borderRadius: 12, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const rejectBtn  = { width: '100%', padding: '12px 0', borderRadius: 12, background: '#dc2626', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const actionApprove = { padding: '6px 14px', borderRadius: 8, background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const actionReject  = { padding: '6px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#dc2626', border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
