// (storefront)/notifications/page.jsx — P14-5
// Full notification history with filter tabs.
'use client';
import { useEffect, useState } from 'react';

const TYPES = { all: 'All', order: 'Orders', wallet: 'Wallet', offer: 'Offers', reminder: 'Reminders' };

export default function NotificationsPage() {
  const [notifs, setNotifs]   = useState([]);
  const [tab, setTab]         = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/backend/customer/notifications?limit=50', { credentials: 'include' })
      .then(r => r.json()).then(d => setNotifs(d.data?.notifications || [])).catch(() => {}).finally(() => setLoading(false));
    // Mark all as read
    fetch('/api/backend/customer/notifications/read-all', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  const filtered = tab === 'all' ? notifs : notifs.filter(n => n.type?.startsWith(tab));

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 80px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>🔔 Notifications</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
        {Object.entries(TYPES).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
            borderColor: tab === key ? '#f97316' : '#e5e7eb',
            background: tab === key ? '#fff7ed' : '#fff',
            color: tab === key ? '#ea580c' : '#6b7280',
            fontWeight: tab === key ? 700 : 500, fontSize: 13,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>No notifications here yet</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
          {filtered.map(n => (
            <div key={n.id} style={{
              padding: '14px 16px', borderBottom: '1px solid #f3f4f6',
              background: n.is_read ? '#fff' : '#fff7ed',
            }}>
              <div style={{ fontWeight: n.is_read ? 500 : 700, fontSize: 14, color: '#1f2937' }}>{n.title}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>{n.body}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 5 }}>
                {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
