'use client';
// ─────────────────────────────────────────────────────────────
// Admin COD Reconciliation — R3
// GET /admin/cod/pending   → list collected-but-not-remitted
// GET /admin/cod/balances  → per-rider cash balance cards
// POST /admin/cod/reconcile → batch mark as remitted
// Follows admin convention: useState + useEffect + api.get/post
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';

// ── Helpers ───────────────────────────────────────────────────
function fmt(paise) {
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN');
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── COD Status Badge ──────────────────────────────────────────
function CodBadge({ status }) {
  const map = {
    pending:        { bg: 'rgba(245,158,11,0.12)',  color: '#d97706', label: 'Pending' },
    collected:      { bg: 'rgba(59,130,246,0.12)',  color: '#2563eb', label: 'Collected' },
    remitted:       { bg: 'rgba(22,163,74,0.12)',   color: '#16a34a', label: 'Remitted' },
    not_applicable: { bg: 'rgba(100,116,139,0.12)', color: '#64748b', label: 'N/A' },
  };
  const s = map[status] || map.not_applicable;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ── Reconcile Modal ───────────────────────────────────────────
function ReconcileModal({ selectedIds, totalPaise, onClose, onDone }) {
  const [ref, setRef]     = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!ref.trim()) { setErr('Remittance reference is required'); return; }
    setSaving(true); setErr('');
    try {
      await api.post('/admin/cod/reconcile', {
        sub_order_ids: selectedIds,
        remittance_ref: ref.trim(),
      });
      onDone();
    } catch (ex) {
      setErr(ex.response?.data?.message || ex.message || 'Failed to reconcile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: 28,
        width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>
          Mark COD as Remitted
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)' }}>
          {selectedIds.length} order(s) — Total: <strong>{fmt(totalPaise)}</strong>
        </p>

        {err && (
          <div style={{
            background: 'rgba(220,38,38,0.1)', color: 'var(--error)',
            padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14,
          }}>
            {err}
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            Remittance Reference *
            <input
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder="e.g. UPI-20240915-001 or CASH-HANDOVER"
              style={{
                display: 'block', width: '100%', marginTop: 6,
                padding: '9px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </label>

          <div style={{ background: 'rgba(22,163,74,0.07)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
            ℹ️ This will mark the rider(s) as having handed over the collected cash to the platform.
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button" onClick={onClose} disabled={saving}
              style={{
                padding: '9px 18px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'transparent',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: '#16a34a', color: '#fff',
                cursor: 'pointer', fontSize: 14, fontWeight: 700,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Mark Remitted'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminCodPage() {
  const [subOrders,   setSubOrders]   = useState([]);
  const [balances,    setBalances]    = useState([]);
  const [grandTotal,  setGrandTotal]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [selected,    setSelected]    = useState(new Set());
  const [showModal,   setShowModal]   = useState(false);
  const [activeTab,   setActiveTab]   = useState('pending'); // 'pending' | 'balances'
  const [success,     setSuccess]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pendingRes, balancesRes] = await Promise.all([
        api.get('/admin/cod/pending?limit=100'),
        api.get('/admin/cod/balances'),
      ]);
      setSubOrders(pendingRes.data?.data?.sub_orders || []);
      setBalances(balancesRes.data?.data?.riders || []);
      setGrandTotal(balancesRes.data?.data?.total_pending_paise || 0);
    } catch (ex) {
      setError(ex.response?.data?.message || ex.message || 'Failed to load COD data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Selection helpers ──────────────────────────────────────
  function toggleAll() {
    if (selected.size === subOrders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(subOrders.map(so => so.id)));
    }
  }

  function toggleOne(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedTotal = subOrders
    .filter(so => selected.has(so.id))
    .reduce((s, so) => s + (so.total_amount || 0), 0);

  function handleReconcileDone() {
    setShowModal(false);
    setSelected(new Set());
    setSuccess('✓ Orders marked as remitted successfully.');
    setTimeout(() => setSuccess(''), 4000);
    load();
  }

  // ── Rider name from nested data ────────────────────────────
  function getRiderName(so) {
    const da = Array.isArray(so.delivery_assignments)
      ? so.delivery_assignments[0]
      : so.delivery_assignments;
    return da?.riders?.profiles?.full_name || '—';
  }

  function getRiderPhone(so) {
    const da = Array.isArray(so.delivery_assignments)
      ? so.delivery_assignments[0]
      : so.delivery_assignments;
    return da?.riders?.profiles?.phone || '';
  }

  function getCustomerName(so) {
    return so.orders?.profiles?.full_name || '—';
  }

  // ── Tab style helper ───────────────────────────────────────
  function tabStyle(name) {
    const active = activeTab === name;
    return {
      padding: '8px 20px', borderRadius: 8, border: 'none',
      cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 500,
      background: active ? 'var(--primary)' : 'transparent',
      color: active ? '#fff' : 'var(--text-2)',
      transition: 'background 0.15s',
    };
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>COD Reconciliation</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-2)', fontSize: 14 }}>
          Track cash collected by riders and reconcile with platform remittances.
        </p>
      </div>

      {/* ── Grand total banner ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0D3B6E 0%, #1e4d8c 100%)',
        borderRadius: 12, padding: '20px 24px', color: '#fff',
        marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 1 }}>
            Total Cash Pending Remittance
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 2 }}>
            {loading ? '…' : fmt(grandTotal)}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Riders holding cash</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{balances.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Orders pending</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{subOrders.length}</div>
        </div>
      </div>

      {/* ── Success message ── */}
      {success && (
        <div style={{
          background: 'rgba(22,163,74,0.12)', color: '#16a34a',
          padding: '10px 16px', borderRadius: 8, marginBottom: 16,
          fontSize: 14, fontWeight: 600,
        }}>
          {success}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: 'rgba(220,38,38,0.1)', color: 'var(--error)',
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', gap: 4, background: 'var(--surface)',
        borderRadius: 10, padding: 4, marginBottom: 20,
        border: '1px solid var(--border)', width: 'fit-content',
      }}>
        <button style={tabStyle('pending')} onClick={() => setActiveTab('pending')}>
          Pending Collection ({subOrders.length})
        </button>
        <button style={tabStyle('balances')} onClick={() => setActiveTab('balances')}>
          Rider Balances ({balances.length})
        </button>
      </div>

      {/* ══ TAB: PENDING ══ */}
      {activeTab === 'pending' && (
        <>
          {/* Batch action bar */}
          {selected.size > 0 && (
            <div style={{
              background: 'rgba(232,116,12,0.08)', border: '1px solid rgba(232,116,12,0.3)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#E8740C' }}>
                {selected.size} selected — {fmt(selectedTotal)}
              </span>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: '#16a34a', color: '#fff',
                  cursor: 'pointer', fontSize: 14, fontWeight: 700,
                  marginLeft: 'auto',
                }}
              >
                ✓ Mark {selected.size} as Remitted
              </button>
              <button
                onClick={() => setSelected(new Set())}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'transparent',
                  cursor: 'pointer', fontSize: 13, color: 'var(--text-2)',
                }}
              >
                Clear
              </button>
            </div>
          )}

          {/* Table */}
          <div style={{
            background: 'var(--surface)', borderRadius: 12,
            border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
                Loading…
              </div>
            ) : subOrders.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
                🎉 No pending COD collections. All riders are up to date!
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', width: 40 }}>
                      <input
                        type="checkbox"
                        checked={selected.size === subOrders.length && subOrders.length > 0}
                        onChange={toggleAll}
                      />
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Order</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Amount</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rider</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Collected At</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subOrders.map((so, i) => (
                    <tr
                      key={so.id}
                      style={{
                        borderBottom: i < subOrders.length - 1 ? '1px solid var(--border)' : 'none',
                        background: selected.has(so.id) ? 'rgba(232,116,12,0.04)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(so.id)}
                          onChange={() => toggleOne(so.id)}
                        />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{so.sub_order_number}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                          {so.orders?.order_number || ''}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                          {fmt(so.total_amount || 0)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        {getCustomerName(so)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        <div>{getRiderName(so)}</div>
                        {getRiderPhone(so) && (
                          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                            {getRiderPhone(so)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-2)' }}>
                        {fmtDate(so.cod_collected_at)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <CodBadge status={so.cod_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══ TAB: BALANCES ══ */}
      {activeTab === 'balances' && (
        <div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
              Loading…
            </div>
          ) : balances.length === 0 ? (
            <div style={{
              background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)',
              padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 14,
            }}>
              🎉 No outstanding COD balances.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {balances.map(rider => (
                <div
                  key={rider.rider_id}
                  style={{
                    background: 'var(--surface)', borderRadius: 12,
                    border: '1px solid var(--border)', padding: '18px 20px',
                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(232,116,12,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 700, color: '#E8740C', flexShrink: 0,
                  }}>
                    {(rider.rider_name || '?')[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{rider.rider_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                      {rider.rider_phone} · {rider.order_count} order{rider.order_count !== 1 ? 's' : ''}
                    </div>
                    {rider.oldest_collected_at && (
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                        Oldest collection: {fmtDate(rider.oldest_collected_at)}
                      </div>
                    )}
                  </div>

                  {/* Amount */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>
                      {fmt(rider.total_paise)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>pending remittance</div>
                  </div>

                  {/* Quick filter button */}
                  <button
                    onClick={() => {
                      setActiveTab('pending');
                      // Filter by this rider — for now just switch to pending tab
                      // Deep filter can be added later
                    }}
                    style={{
                      padding: '7px 14px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'transparent',
                      cursor: 'pointer', fontSize: 12, color: 'var(--text-2)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    View Orders
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reconcile Modal ── */}
      {showModal && (
        <ReconcileModal
          selectedIds={[...selected]}
          totalPaise={selectedTotal}
          onClose={() => setShowModal(false)}
          onDone={handleReconcileDone}
        />
      )}
    </div>
  );
}
