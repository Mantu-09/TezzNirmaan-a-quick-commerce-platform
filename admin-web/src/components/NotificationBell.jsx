'use client';
/**
 * NotificationBell — B1
 *
 * Dashboard bell icon in the top nav bar.
 * Shows unread count badge, opens a dropdown with last 10 notifications.
 * Subscribes to Supabase Realtime for live updates.
 *
 * Only shown for shop_owner role (not rider).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { notificationApi } from '../lib/api';
import { subscribeToNotifications } from '../lib/supabase';
import useAuthStore from '../store/authStore';

// ── Notification type → emoji ─────────────────────────────────
const TYPE_ICON = {
  order_placed:     '🛒',
  order_confirmed:  '✅',
  order_preparing:  '📦',
  out_for_delivery: '🛵',
  delivered:        '🎉',
  order_rejected:   '❌',
  order_cancelled:  '🚫',
  new_order:        '🔔',
  new_assignment:   '📍',
  low_stock:        '⚠️',
};

function getRelativeTime(isoString) {
  const diff  = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (mins  < 1)  return 'Just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(isoString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
  const { user, role }            = useAuthStore();
  const [open, setOpen]           = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]     = useState(false);
  const dropdownRef               = useRef(null);

  // ── Fetch last 10 notifications ───────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await notificationApi.getAll(1);
      const items = (res?.notifications || []).slice(0, 10);
      setNotifications(items);
      setUnreadCount(items.filter(n => !n.is_read).length);
    } catch (err) {
      console.error('[NotificationBell] fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Supabase Realtime ─────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToNotifications(user.id, (newNotif) => {
      setNotifications(prev => [newNotif, ...prev].slice(0, 10));
      setUnreadCount(c => c + 1);
    });
    return unsubscribe;
  }, [user?.id]);

  // ── Close on outside click ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Mark all read ─────────────────────────────────────────────
  const handleMarkAllRead = async (e) => {
    e.stopPropagation();
    try {
      await notificationApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('[NotificationBell] mark-all-read failed:', err.message);
    }
  };

  // ── Toggle dropdown ───────────────────────────────────────────
  const handleToggle = () => {
    setOpen(prev => !prev);
    if (!open) fetchNotifications(); // refresh when opening
  };

  // Only show for shop_owner
  if (role !== 'shop_owner' && role !== 'shop_staff') return null;

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell button */}
      <button
        id="notification-bell-btn"
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        style={{
          position:   'relative',
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          fontSize:   22,
          lineHeight: 1,
          padding:    '4px 8px',
          borderRadius: 8,
          transition: 'background 0.15s',
          color:      open ? 'var(--primary)' : 'var(--text-2)',
          background: open ? 'var(--primary-10, rgba(99,102,241,0.1))' : 'none',
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position:      'absolute',
            top:            0,
            right:          4,
            background:    '#EF4444',
            color:         '#fff',
            borderRadius:  10,
            minWidth:      18,
            height:        18,
            display:       'flex',
            alignItems:    'center',
            justifyContent:'center',
            fontSize:      11,
            fontWeight:    700,
            padding:       '0 4px',
            lineHeight:    '18px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:   'absolute',
          top:        'calc(100% + 8px)',
          right:       0,
          width:       340,
          background: 'var(--surface)',
          border:     '1px solid var(--border)',
          borderRadius: 12,
          boxShadow:  '0 8px 32px rgba(0,0,0,0.18)',
          zIndex:      1000,
          overflow:   'hidden',
        }}>
          {/* Dropdown header */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '12px 16px',
            borderBottom:   '1px solid var(--border)',
            background:     'var(--surface-2)',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              Notifications
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--primary)', fontWeight: 600,
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 16, color: 'var(--text-2)', lineHeight: 1,
                }}
                aria-label="Close notifications"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
                Loading…
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
                🔕 No notifications yet
              </div>
            )}
            {!loading && notifications.map(n => (
              <div
                key={n.id}
                style={{
                  display:       'flex',
                  gap:           12,
                  padding:       '12px 16px',
                  borderBottom:  '1px solid var(--border)',
                  background:    n.is_read ? 'var(--surface)' : 'rgba(99,102,241,0.06)',
                  cursor:        'default',
                  transition:    'background 0.15s',
                }}
              >
                {/* Icon */}
                <div style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.4 }}>
                  {TYPE_ICON[n.type] || '📢'}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display:        'flex',
                    justifyContent: 'space-between',
                    alignItems:     'flex-start',
                    gap:             8,
                  }}>
                    <span style={{
                      fontSize:   13,
                      fontWeight: n.is_read ? 500 : 700,
                      color:      'var(--text)',
                      overflow:   'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex:       1,
                    }}>
                      {n.title}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', flexShrink: 0 }}>
                      {getRelativeTime(n.created_at)}
                    </span>
                  </div>
                  <p style={{
                    margin:     0,
                    fontSize:   12,
                    color:      'var(--text-2)',
                    lineHeight: '1.4',
                    marginTop:  2,
                    display:    '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow:   'hidden',
                  }}>
                    {n.message}
                  </p>
                </div>

                {/* Unread dot */}
                {!n.is_read && (
                  <div style={{
                    width: 8, height: 8,
                    borderRadius: 4,
                    background: '#6366F1',
                    flexShrink: 0,
                    marginTop:  6,
                  }} />
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{
              padding:     '10px 16px',
              borderTop:   '1px solid var(--border)',
              textAlign:   'center',
              background:  'var(--surface-2)',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                Showing last {notifications.length} notifications
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
