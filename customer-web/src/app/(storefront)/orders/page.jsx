// ─────────────────────────────────────────────────────────────
// (storefront)/orders/page.jsx — P12-1
//
// Customer order history page.
// Auth-gated: redirects to /auth?redirect=/orders if not logged in.
// Shows all orders with status badge, items preview, reorder button.
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';
import { useRouter }           from 'next/navigation';
import Link                    from 'next/link';
import Cookies                 from 'js-cookie';

const API = '/api/backend';

// ── Status badge ──────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:    { label: 'Pending',     color: '#92400e', bg: '#fef3c7' },
  confirmed:  { label: 'Confirmed',   color: '#1e40af', bg: '#dbeafe' },
  preparing:  { label: 'Preparing',   color: '#6d28d9', bg: '#ede9fe' },
  ready:      { label: 'Ready',       color: '#065f46', bg: '#d1fae5' },
  on_the_way: { label: 'On the Way',  color: '#0369a1', bg: '#e0f2fe' },
  delivered:  { label: 'Delivered',   color: '#166534', bg: '#dcfce7' },
  cancelled:  { label: 'Cancelled',   color: '#991b1b', bg: '#fee2e2' },
  returned:   { label: 'Returned',    color: '#6b7280', bg: '#f3f4f6' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}
function fmtAmount(paise) {
  return `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;
}

// ── Order card ────────────────────────────────────────────────
function OrderCard({ order }) {
  const items     = order.sub_orders?.[0]?.order_items || order.items || [];
  const status    = order.sub_orders?.[0]?.status || order.status || 'pending';
  const orderNum  = order.order_number || order.id?.slice(0, 8).toUpperCase();
  const isActive  = !['delivered','cancelled','returned'].includes(status);
  const [reordering,  setReordering]  = React.useState(false); // P14-4
  const [cancelling,  setCancelling]  = React.useState(false); // M6

  async function handleReorder() { // P14-4
    setReordering(true);
    try {
      const r = await fetch(`/api/backend/customer/orders/${order.id}/reorder`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) window.location.href = '/cart';
      else alert(d.message || 'Could not reorder. Some items may be out of stock.');
    } catch { alert('Network error. Try again.'); }
    setReordering(false);
  }

  // M6: Customer cancellation — only for pending orders
  async function handleCancel() {
    if (!confirm('Cancel this order? This cannot be undone.')) return;
    setCancelling(true);
    try {
      const r = await fetch(`/api/backend/customer/orders/${order.id}`, { method: 'DELETE', credentials: 'include' });
      const d = await r.json();
      if (r.ok) window.location.reload();
      else alert(d.message || 'Could not cancel order.');
    } catch { alert('Network error. Try again.'); }
    setCancelling(false);
  }

  return (
    <div style={{
      background: 'var(--sf-surface,#fff)', borderRadius: 16,
      border: '1px solid var(--sf-border,#e5e7eb)', overflow: 'hidden', marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 18px', borderBottom: '1px solid var(--sf-border,#f3f4f6)',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sf-text,#111827)' }}>
            Order #{orderNum}
          </div>
          <div style={{ fontSize: 11, color: 'var(--sf-text-2,#9ca3af)', marginTop: 2 }}>
            {fmtDate(order.created_at)} · {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <StatusBadge status={status} />
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sf-text,#111827)' }}>
            {fmtAmount(order.total_amount)}
          </div>
        </div>
      </div>

      {/* Items preview (max 3) */}
      {items.length > 0 && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--sf-border,#f3f4f6)' }}>
          {items.slice(0, 3).map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: i < Math.min(items.length, 3) - 1 ? 8 : 0 }}>
              {item.image_url
                ? <img src={item.image_url} alt={item.product_name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--sf-border,#e5e7eb)' }} />
                : <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>
              }
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sf-text,#111827)' }}>{item.product_name || item.name}</div>
                <div style={{ fontSize: 11, color: 'var(--sf-text-2,#9ca3af)' }}>Qty: {item.quantity}</div>
              </div>
            </div>
          ))}
          {items.length > 3 && (
            <div style={{ fontSize: 12, color: 'var(--sf-text-2,#9ca3af)', marginTop: 6 }}>
              +{items.length - 3} more item{items.length - 3 !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 18px' }}>
        {isActive && (
          <Link href={`/track?order_number=${orderNum}`}
            style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 10, border: '1px solid var(--sf-primary,#f97316)', color: 'var(--sf-primary,#f97316)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            🚴 Track Order
          </Link>
        )}
        {status === 'delivered' && (
          <button
            style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', background: reordering ? '#9ca3af' : 'var(--sf-primary,#f97316)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: reordering ? 'default' : 'pointer' }}
            onClick={handleReorder}
            disabled={reordering}>
            {reordering ? 'Adding to cart...' : '🔄 Reorder'}
          </button>
        )}
        {status === 'delivered' && (
          <Link href={`/track?order_number=${orderNum}#rating`}
            style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 10, border: '1px solid var(--sf-border,#e5e7eb)', color: 'var(--sf-text-2,#6b7280)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            ⭐ Rate
          </Link>
        )}
        {/* P18-5: Download Receipt */}
        {(status === 'delivered' || status === 'confirmed') && order?.id && (
          <a
            href={`/api/backend/customer/orders/${order.id}/receipt`}
            download
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid #e5e7eb', color: '#374151', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
            📄 Receipt
          </a>
        )}
        {/* M6: Cancel Order — only for pending orders */}
        {status === 'pending' && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid #fca5a5', background: cancelling ? '#f3f4f6' : '#fff1f2', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: cancelling ? 'default' : 'pointer' }}>
            {cancelling ? 'Cancelling...' : '✕ Cancel Order'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function OrdersPage() {
  const router = useRouter();
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState('all'); // 'all' | 'active' | 'delivered'

  useEffect(() => {
    const token = Cookies.get('tn_token');
    if (!token) { router.push('/auth?redirect=/orders'); return; }
    fetch(`${API}/customer/orders?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => setOrders(json.data?.orders || json.orders || []))
      .catch(() => setError('Failed to load orders'))
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = orders.filter(o => {
    const s = o.sub_orders?.[0]?.status || o.status || '';
    if (filter === 'active')    return !['delivered','cancelled','returned'].includes(s);
    if (filter === 'delivered') return s === 'delivered';
    return true;
  });

  const pill = (f, label) => (
    <button
      onClick={() => setFilter(f)}
      style={{
        padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: '1px solid var(--sf-border,#e5e7eb)',
        background: filter === f ? 'var(--sf-primary,#f97316)' : 'var(--sf-surface,#fff)',
        color:      filter === f ? '#fff'                        : 'var(--sf-text-2,#6b7280)',
      }}
    >{label}</button>
  );

  return (
    <div className="sf-wrap sf-section" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)', marginBottom: 16 }}>
        <Link href="/" style={{ color: 'var(--sf-primary,#f97316)' }}>Home</Link> ›{' '}
        <Link href="/profile" style={{ color: 'var(--sf-primary,#f97316)' }}>Profile</Link> › My Orders
      </div>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 20 }}>My Orders</h1>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {pill('all', `All (${orders.length})`)}
        {pill('active', 'Active')}
        {pill('delivered', 'Delivered')}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--sf-text-2,#9ca3af)' }}>
          Loading orders…
        </div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No orders yet</div>
          <Link href="/" className="sf-btn sf-btn-primary">Start Shopping</Link>
        </div>
      )}
      {filtered.map(order => <OrderCard key={order.id} order={order} />)}
    </div>
  );
}
