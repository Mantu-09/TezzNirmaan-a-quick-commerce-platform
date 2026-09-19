'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';

function StatusBadge({ active }) {
  return (
    <span style={{ background: active ? '#f0fdf4' : '#fef2f2', color: active ? '#16a34a' : '#dc2626', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 16 }}>
      {active ? '✓ Active' : '✗ Suspended'}
    </span>
  );
}

export default function AdminUsersPage() {
  const [users,    setUsers]    = useState([]);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [actionMsg, setActionMsg] = useState('');

  const loadUsers = useCallback(async (q = search, p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 20 });
      if (q) params.set('search', q);
      const res = await api.get(`/admin/users?${params.toString()}`);
      const data = res?.data || {};
      setUsers(p === 1 ? (data.users || []) : prev => [...prev, ...(data.users || [])]);
      setTotal(data.pagination?.total || 0);
      setPage(p);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { loadUsers('', 1); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadUsers(search, 1);
  };

  const handleSuspend = async (userId, isSuspended) => {
    const reason = isSuspended ? null : prompt('Reason for suspension:');
    if (!isSuspended && !reason) return;
    try {
      await api.patch(`/admin/users/${userId}`, { is_suspended: !isSuspended, suspension_reason: reason });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_suspended: !isSuspended } : u));
      setActionMsg(isSuspended ? 'User reactivated.' : 'User suspended.');
      setTimeout(() => setActionMsg(''), 4000);
    } catch (err) {
      setActionMsg(err.message || 'Action failed.');
    }
  };

  const handleWalletCredit = async (userId) => {
    const amountStr = prompt('Credit/debit amount in ₹ (use negative to debit):');
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return;
    const reason = prompt('Reason:');
    if (!reason) return;
    try {
      await api.post(`/admin/users/${userId}/wallet`, { amount_paise: Math.round(amount * 100), reason });
      setActionMsg(`Wallet ${amount >= 0 ? 'credited' : 'debited'} ₹${Math.abs(amount)}`);
      setTimeout(() => setActionMsg(''), 4000);
    } catch (err) {
      setActionMsg(err.message || 'Wallet action failed.');
    }
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>👥 Customer Users</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{total} total customers</p>
        </div>
      </div>

      {actionMsg && (
        <div style={{ background: '#f0fdf4', color: '#15803d', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
          ✅ {actionMsg}
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by phone or name..."
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
        {search && (
          <button type="button" className="btn" onClick={() => { setSearch(''); loadUsers('', 1); }}>
            Clear
          </button>
        )}
      </form>

      {/* Users table */}
      {loading && users.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#0D3B6E', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af', background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>👥</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>No users found</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f3f4f6', background: '#f9fafb' }}>
                {['Name', 'Phone', 'City', 'Orders', 'Wallet', 'Joined', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    {u.full_name || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151', fontFamily: 'monospace' }}>
                    {u.phone}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#6b7280' }}>
                    {u.city || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    {u.order_count || 0}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#f97316' }}>
                    ₹{Math.floor((u.wallet_balance_paise || 0) / 100)}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { dateStyle: 'short' }) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <StatusBadge active={!u.is_suspended} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleWalletCredit(u.id)}
                        style={{ padding: '4px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#1e40af', cursor: 'pointer' }}
                        title="Wallet credit/debit"
                      >
                        💳
                      </button>
                      <button
                        onClick={() => handleSuspend(u.id, u.is_suspended)}
                        style={{ padding: '4px 8px', background: u.is_suspended ? '#f0fdf4' : '#fef2f2', border: `1px solid ${u.is_suspended ? '#86efac' : '#fecaca'}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: u.is_suspended ? '#15803d' : '#dc2626', cursor: 'pointer' }}
                      >
                        {u.is_suspended ? '✅' : '🚫'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length < total && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button
                onClick={() => loadUsers(search, page + 1)}
                disabled={loading}
                style={{ padding: '10px 24px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 8, fontWeight: 700, fontSize: 13, color: '#374151', cursor: 'pointer' }}
              >
                {loading ? 'Loading…' : `Load more (${total - users.length} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
