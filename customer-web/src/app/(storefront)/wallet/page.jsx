// (storefront)/wallet/page.jsx — P14-1 Upgraded
// Full wallet transaction history with balance counter, expiry alerts.
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const fmt = p => `₹${(p / 100).toFixed(p % 100 === 0 ? 0 : 2)}`;

function TxRow({ tx }) {
  const isCredit = tx.type === 'credit' || tx.type === 'cashback' || tx.type === 'referral';
  const expired  = tx.expires_at && new Date(tx.expires_at) < new Date();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isCredit ? '#f0fdf4' : '#fff1f2', fontSize: 18, flexShrink: 0,
      }}>
        {isCredit ? '💰' : '🛒'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tx.description || (isCredit ? 'Cashback credited' : 'Order payment')}
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
          {new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          {tx.expires_at && !expired && (
            <span style={{ color: '#f97316', marginLeft: 6 }}>· Expires {new Date(tx.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          )}
          {expired && <span style={{ color: '#ef4444', marginLeft: 6 }}>· Expired</span>}
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: isCredit ? '#16a34a' : '#ef4444', flexShrink: 0 }}>
        {isCredit ? '+' : '-'}{fmt(tx.amount)}
      </div>
    </div>
  );
}

export default function WalletPage() {
  const [balance, setBalance]   = useState(0);
  const [txns, setTxns]         = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/backend/customer/wallet/history?limit=50', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setBalance(d.data?.balance || 0);
        setTxns(d.data?.transactions || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Expiring soon (within 7 days)
  const expiringSoon = txns.filter(t => t.expires_at && new Date(t.expires_at) > new Date() &&
    new Date(t.expires_at) < new Date(Date.now() + 7 * 86400000) && t.type !== 'debit');

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 80px' }}>
      {/* Balance Card */}
      <div style={{
        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        borderRadius: 20, padding: 28, marginBottom: 20, color: '#fff', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>TezzNirmaan Wallet</div>
        <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>{fmt(balance)}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Available Balance</div>
      </div>

      {/* Expiry alert */}
      {expiringSoon.length > 0 && (
        <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#c2410c', fontSize: 14 }}>⚠️ Cashback expiring soon!</div>
          <div style={{ color: '#9a3412', fontSize: 13, marginTop: 2 }}>
            {fmt(expiringSoon.reduce((s, t) => s + (t.amount || 0), 0))} expires within 7 days — use it before it's gone.
          </div>
          <Link href="/search" style={{ display: 'inline-block', marginTop: 8, background: '#f97316', color: '#fff', padding: '6px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            Shop now
          </Link>
        </div>
      )}

      {/* Transaction history */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '8px 16px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px' }}>Transaction History</h2>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
        ) : txns.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            No transactions yet. Place your first order to earn cashback! 🎉
          </div>
        ) : txns.map(tx => <TxRow key={tx.id} tx={tx} />)}
      </div>
    </div>
  );
}
