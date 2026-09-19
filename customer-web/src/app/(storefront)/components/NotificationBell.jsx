// (storefront)/components/NotificationBell.jsx — P14-5
// Bell icon in header with unread badge count.
// Dropdown shows last 10 notifications. Click to open /notifications.
'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function NotificationBell() {
  const [unread, setUnread]   = useState(0);
  const [notifs, setNotifs]   = useState([]);
  const [open, setOpen]       = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    loadNotifs();
    const iv = setInterval(loadNotifs, 60000); // Refresh every 60s
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadNotifs() {
    try {
      const r = await fetch('/api/backend/customer/notifications?limit=10', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setUnread(d.data?.unread_count || 0);
      setNotifs(d.data?.notifications || []);
    } catch {}
  }

  async function markAllRead() {
    await fetch('/api/backend/customer/notifications/read-all', { method: 'POST', credentials: 'include' })
      .catch(() => {});
    setUnread(0);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(o => !o); if (!open && unread > 0) markAllRead(); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, position: 'relative', fontSize: 20 }}
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0, background: '#ef4444',
            color: '#fff', borderRadius: '50%', fontSize: 10, fontWeight: 700,
            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 36, width: 320, maxHeight: 400,
          background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.15)',
          overflowY: 'auto', zIndex: 1000, border: '1px solid #f1f5f9',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Notifications</span>
            <Link href="/notifications" style={{ fontSize: 12, color: '#f97316', textDecoration: 'none' }}>View all</Link>
          </div>

          {notifs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No notifications yet</div>
          ) : notifs.map(n => (
            <div key={n.id} style={{
              padding: '10px 16px', borderBottom: '1px solid #f9fafb',
              background: n.is_read ? '#fff' : '#fff7ed',
              transition: 'background .2s',
            }}>
              <div style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 600, color: '#1f2937', marginBottom: 2 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{n.body}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
