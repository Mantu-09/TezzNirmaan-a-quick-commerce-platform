'use client';
// ────────────────────────────────────────────────────────────
// Bank Account & Payout Page — P8-2
// Route: /dashboard/bank-account
//
// Shows shop owner:
//   1. Linked account status (Razorpay Route on/off)
//   2. Bank account details (masked account number)
//   3. Recent Route transfers with amounts + order refs
//   4. Bank account setup form (if not yet configured)
//   5. Weekly earnings summary
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────
const fmtPaise = (p) =>
  `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '—';

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : '—';

function getToken() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('auth-storage'))?.state?.token; } catch { return null; }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || data?.message || 'Request failed');
  return data;
}

// ── Status Badge ──────────────────────────────────────────────
const TRANSFER_STATUS = {
  processed: { label: 'Transferred ✓', bg: 'rgba(22,163,74,0.1)',   color: '#16a34a', dot: '#16a34a' },
  pending:   { label: 'Pending',        bg: 'rgba(245,158,11,0.12)', color: '#d97706', dot: '#f59e0b' },
  failed:    { label: 'Failed',         bg: 'rgba(220,38,38,0.1)',   color: '#dc2626', dot: '#dc2626' },
  reversed:  { label: 'Reversed',       bg: 'rgba(107,114,128,0.1)', color: '#6b7280', dot: '#9ca3af' },
};

function TransferBadge({ status }) {
  const s = TRANSFER_STATUS[status] || TRANSFER_STATUS.pending;
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

// ── Route Status Card ─────────────────────────────────────────
function RouteStatusCard({ account, onRefresh }) {
  const isOnRoute = !!account?.razorpay_account_id;

  return (
    <div style={{
      background: isOnRoute
        ? 'linear-gradient(135deg, rgba(22,163,74,0.08) 0%, rgba(16,185,129,0.06) 100%)'
        : 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(239,68,68,0.06) 100%)',
      border: `1px solid ${isOnRoute ? 'rgba(22,163,74,0.2)' : 'rgba(245,158,11,0.2)'}`,
      borderRadius: 16, padding: '20px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 32 }}>{isOnRoute ? '✅' : '⏳'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>
            Razorpay Route: {isOnRoute ? 'Active' : 'Not Yet Active'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
            {isOnRoute
              ? 'Payments are automatically transferred after each delivered order'
              : 'Submit your bank details to enable automatic payouts'}
          </div>
        </div>
      </div>
      {isOnRoute && (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Account ID
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 13, color: 'var(--text-2)',
            background: 'rgba(0,0,0,0.04)', padding: '3px 8px', borderRadius: 6,
            marginTop: 2,
          }}>
            {account.razorpay_account_id}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bank Account Details Card ─────────────────────────────────
function BankDetailsCard({ account }) {
  if (!account) return null;
  const fields = [
    { label: 'Account Holder', value: account.account_name },
    { label: 'Account Number', value: account.account_number, mono: true },
    { label: 'IFSC Code',      value: account.ifsc_code,      mono: true },
    { label: 'Bank',           value: account.bank_name || '—' },
    { label: 'Account Type',   value: account.account_type
        ? account.account_type.charAt(0).toUpperCase() + account.account_type.slice(1)
        : '—' },
  ];

  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 16, padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
          🏦 Bank Account
        </h3>
        {account.is_verified
          ? <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, background: 'rgba(22,163,74,0.1)', padding: '2px 10px', borderRadius: 20 }}>
              ✓ Verified
            </span>
          : <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600, background: 'rgba(245,158,11,0.1)', padding: '2px 10px', borderRadius: 20 }}>
              Pending Verification
            </span>
        }
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
        {fields.map(f => (
          <div key={f.label}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>
              {f.label}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
              ...(f.mono ? { fontFamily: 'monospace', letterSpacing: 1 } : {}),
            }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bank Account Setup Form ───────────────────────────────────
function BankAccountForm({ existing, onSave }) {
  const [form, setForm] = useState({
    account_name:   existing?.account_name   || '',
    account_number: '',  // never pre-fill account number for security
    confirm_number: '',
    ifsc_code:      existing?.ifsc_code      || '',
    bank_name:      existing?.bank_name      || '',
    account_type:   existing?.account_type   || 'savings',
    pan_number:     '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [ifscLookup, setIfscLookup] = useState('');

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  // Auto-lookup bank name from IFSC
  const handleIfscBlur = async () => {
    const code = form.ifsc_code.trim().toUpperCase();
    if (code.length !== 11) return;
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${code}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.BANK) {
          setForm(f => ({ ...f, bank_name: data.BANK }));
          setIfscLookup(data.BANK);
        }
      }
    } catch {
      // IFSC lookup is optional — don't block the form
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.account_number !== form.confirm_number) {
      setError('Account numbers do not match');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        account_name:   form.account_name.trim(),
        account_number: form.account_number.trim(),
        ifsc_code:      form.ifsc_code.trim().toUpperCase(),
        bank_name:      form.bank_name.trim() || undefined,
        account_type:   form.account_type,
        pan_number:     form.pan_number.trim() || undefined,
      };
      await apiFetch('/api/v1/shop/bank-account', {
        method: 'POST',
        body:   JSON.stringify(payload),
      });
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--bg-1)',
    color: 'var(--text-1)', fontSize: 14, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 600,
    color: 'var(--text-2)',
  };

  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 16, padding: 24,
    }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
        🏦 {existing ? 'Update Bank Account' : 'Set Up Payout Account'}
      </h3>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-3)' }}>
        Your money will be automatically transferred after each delivered order.
        No more waiting for weekly transfers.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Account Holder Name</label>
            <input
              name="account_name" value={form.account_name}
              onChange={handleChange} style={inputStyle}
              placeholder="As it appears on your bank account"
              required autoComplete="name"
            />
          </div>

          <div>
            <label style={labelStyle}>Account Number</label>
            <input
              name="account_number" value={form.account_number}
              onChange={handleChange} style={inputStyle}
              placeholder="Enter account number"
              type="password" required
            />
          </div>

          <div>
            <label style={labelStyle}>Confirm Account Number</label>
            <input
              name="confirm_number" value={form.confirm_number}
              onChange={handleChange} style={inputStyle}
              placeholder="Re-enter account number"
              type="password" required
            />
          </div>

          <div>
            <label style={labelStyle}>IFSC Code</label>
            <input
              name="ifsc_code" value={form.ifsc_code}
              onChange={handleChange} onBlur={handleIfscBlur}
              style={{ ...inputStyle, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 1 }}
              placeholder="e.g. SBIN0001234"
              maxLength={11} required
            />
            {ifscLookup && (
              <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                ✓ {ifscLookup}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Account Type</label>
            <select
              name="account_type" value={form.account_type}
              onChange={handleChange}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="savings">Savings</option>
              <option value="current">Current</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>PAN Number <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(Optional — improves verification)</span></label>
            <input
              name="pan_number" value={form.pan_number}
              onChange={handleChange}
              style={{ ...inputStyle, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: 1 }}
              placeholder="e.g. ABCDE1234F"
              maxLength={10}
            />
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 13,
            border: '1px solid rgba(220,38,38,0.2)',
          }}>
            ❌ {error}
          </div>
        )}

        <button
          type="submit" disabled={saving}
          style={{
            marginTop: 20, width: '100%', padding: '12px 24px',
            background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
            color: '#fff', border: 'none', borderRadius: 12,
            fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1, transition: 'all 0.2s',
          }}
        >
          {saving ? 'Saving…' : (existing ? '✓ Update Bank Account' : '✓ Save Bank Account')}
        </button>
      </form>
    </div>
  );
}

// ── Transfer History ──────────────────────────────────────────
function TransferHistory({ transfers, weekTotal }) {
  if (!transfers?.length) {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 40, textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>
          No transfers yet
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
          Transfers will appear here after your first paid order
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
          Recent Transfers
        </h3>
        {weekTotal > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            This week: <strong style={{ color: '#7c3aed' }}>{fmtPaise(weekTotal)}</strong>
          </div>
        )}
      </div>

      <div>
        {transfers.map((t, i) => (
          <div
            key={t.id}
            style={{
              padding: '14px 24px',
              borderBottom: i < transfers.length - 1 ? '1px solid var(--border-light, rgba(0,0,0,0.05))' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.02)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {/* Left: order info + date */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>
                Order #{t.orders?.order_number || '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {fmtDateTime(t.transferred_at || t.created_at)}
                {t.razorpay_transfer_id && (
                  <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>
                    · {t.razorpay_transfer_id.slice(-8)}
                  </span>
                )}
              </div>
            </div>

            {/* Centre: commission breakdown tooltip */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
                {fmtPaise(t.net_amount_paise)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                of {fmtPaise(t.gross_amount_paise)} · {t.commission_percent}% commission
              </div>
            </div>

            {/* Right: status */}
            <div style={{ flexShrink: 0 }}>
              <TransferBadge status={t.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function BankAccountPage() {
  const [account,   setAccount]   = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [weekTotal, setWeekTotal] = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [error,     setError]     = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [acctRes, txRes] = await Promise.all([
        apiFetch('/api/v1/shop/bank-account'),
        apiFetch('/api/v1/shop/route/transfers?limit=20'),
      ]);
      setAccount(acctRes.bank_account);
      setTransfers(txRes.transfers || []);
      setWeekTotal(txRes.week_total_paise || 0);
      setShowForm(!acctRes.has_account); // open form if no account yet
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFormSave = () => {
    setShowForm(false);
    loadData();
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
        <div style={{
          width: 32, height: 32, border: '3px solid var(--border)',
          borderTopColor: '#7c3aed', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        Loading payout details…
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 0' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>
          💳 Bank Account &amp; Payouts
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-3)' }}>
          Automatic payouts via Razorpay Route — money lands in your account instantly after delivery.
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 12, marginBottom: 20,
          background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 14,
          border: '1px solid rgba(220,38,38,0.2)',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Route Status ── */}
      <div style={{ marginBottom: 20 }}>
        <RouteStatusCard account={account} onRefresh={loadData} />
      </div>

      {/* ── Bank Details or Form ── */}
      {account && !showForm ? (
        <div style={{ marginBottom: 20 }}>
          <BankDetailsCard account={account} />
          <button
            onClick={() => setShowForm(true)}
            style={{
              marginTop: 12, padding: '8px 16px', borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-2)', fontSize: 13, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.target.style.borderColor = '#7c3aed'; e.target.style.color = '#7c3aed'; }}
            onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-2)'; }}
          >
            ✏️ Update bank details
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <BankAccountForm existing={account} onSave={handleFormSave} />
          {account && (
            <button
              onClick={() => setShowForm(false)}
              style={{
                marginTop: 10, padding: '6px 14px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-3)', fontSize: 13, cursor: 'pointer',
              }}
            >
              ← Cancel
            </button>
          )}
        </div>
      )}

      {/* ── Transfer History ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
            Transfer History
          </h2>
          <button
            onClick={loadData}
            style={{
              padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-3)', fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ↻ Refresh
          </button>
        </div>
        <TransferHistory transfers={transfers} weekTotal={weekTotal} />
      </div>

      {/* ── Info footnote ── */}
      <div style={{
        marginTop: 24, padding: '14px 18px', borderRadius: 12,
        background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)',
        fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text-2)' }}>ℹ️ How payouts work:</strong> When a customer pays,
        TezzNirmaan deducts its platform commission and transfers the remaining amount directly to your
        bank account via Razorpay Route — automatically, within minutes of delivery confirmation.
        No weekly wait. No WhatsApp transfers.
      </div>
    </div>
  );
}
