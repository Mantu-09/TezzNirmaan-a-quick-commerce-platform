// (storefront)/components/CashbackBadge.jsx — P14-2
// Shows estimated cashback on product/cart.
// Pass earnPaise prop (calculated from cashback rules).
'use client';

export function CashbackBadge({ earnPaise }) {
  if (!earnPaise || earnPaise <= 0) return null;
  return (
    <span style={{
      display: 'inline-block', background: '#f0fdf4',
      color: '#16a34a', fontSize: 11, fontWeight: 700,
      padding: '2px 8px', borderRadius: 10,
      border: '1px solid #bbf7d0',
    }}>
      💰 Earn ₹{Math.floor(earnPaise / 100)} cashback
    </span>
  );
}

export function CartCashbackSummary({ orderTotalPaise, cashbackPct = 0, maxPaise }) {
  if (!cashbackPct) return null;
  const raw     = Math.floor(orderTotalPaise * cashbackPct / 100);
  const earn    = maxPaise ? Math.min(raw, maxPaise) : raw;
  if (earn <= 0) return null;
  return (
    <div style={{
      background: '#f0fdf4', border: '1px solid #bbf7d0',
      borderRadius: 10, padding: '10px 14px', marginTop: 8,
      fontSize: 13, color: '#15803d', fontWeight: 600,
    }}>
      🎉 You will earn <strong>₹{Math.floor(earn / 100)}</strong> cashback on this order!
    </div>
  );
}
