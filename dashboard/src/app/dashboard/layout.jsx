'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useOrderAlerts } from '../../hooks/useOrderAlerts';
import useAuthStore from '../../store/authStore';
import { getMuted, setMuted } from '../../lib/sounds';
import NotificationBell from '../../components/NotificationBell';

const NAV_ITEMS = [
  { href: '/dashboard/orders',    icon: '🛒', label: 'Orders',        roles: ['shop_owner', 'shop_staff'] },
  { href: '/dashboard/inventory', icon: '📦', label: 'Inventory',     roles: ['shop_owner', 'shop_staff'] },
  { href: '/dashboard/delivery',  icon: '🛵', label: 'Delivery',      roles: ['shop_owner'] },
  { href: '/dashboard/analytics', icon: '📈', label: 'Analytics',     roles: ['shop_owner'] },
  { href: '/dashboard/slots',     icon: '🗓️', label: 'Slots',         roles: ['shop_owner'] },  // B6
  { href: '/dashboard/reviews',   icon: '⭐', label: 'Reviews',       roles: ['shop_owner'] },
  { href: '/dashboard/summary',   icon: '📊', label: "Today's Summary", roles: ['shop_owner'] },
  { href: '/admin/shops',         icon: '🏪', label: 'Admin: Shops',  roles: ['platform_admin'] },
  { href: '/admin/riders',        icon: '👤', label: 'Admin: Riders', roles: ['platform_admin'] },
];





export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, role, clearSession } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [alertBanner,   setAlertBanner]   = useState(null);
  const [muted, setMutedState] = useState(getMuted());

  // ── Realtime order alerts ─────────────────────────────────────
  const handleNewOrder = useCallback((subOrder) => {
    setNewOrderCount(c => c + 1);
    setAlertBanner(`New order received! ${subOrder.order_number || ''}`);
    setTimeout(() => setAlertBanner(null), 6000);
    // Clear badge when user navigates to orders
  }, []);

  useOrderAlerts(handleNewOrder);

  const handleNavClick = (href) => {
    if (href === '/dashboard/orders') setNewOrderCount(0);
    setSidebarOpen(false);
  };

  const handleMuteToggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const handleSignOut = () => {
    clearSession();
    router.push('/login');
  };

  const visibleNav = NAV_ITEMS.filter(n => n.roles.includes(role));

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 99, display: 'none',
          }}
          className="mobile-overlay"
        />
      )}

      {/* Sidebar */}
      <nav className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-text">TezzNirmaan</div>
          <div className="sidebar-logo-sub">Shop Dashboard</div>
        </div>

        <ul className="sidebar-nav">
          {visibleNav.map(item => {
            const isActive = pathname.startsWith(item.href);
            const count    = item.href.includes('orders') ? newOrderCount : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`sidebar-nav-item${isActive ? ' active' : ''}`}
                  onClick={() => handleNavClick(item.href)}
                >
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  {item.label}
                  {count > 0 && <span className="nav-badge">{count}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="sidebar-bottom">
          {/* Mute toggle */}
          <button
            onClick={handleMuteToggle}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              color: 'var(--sidebar-text)', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 13, marginBottom: 12, width: '100%',
            }}
          >
            <span>{muted ? '🔇' : '🔔'}</span>
            {muted ? 'Alerts muted' : 'Alerts on'}
          </button>

          <div className="sidebar-user">
            <div className="sidebar-user-name">{user?.full_name || 'Shop Owner'}</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>{user?.phone}</div>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              marginTop: 12, color: '#F87171', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 13, textAlign: 'left', width: '100%',
            }}
          >
            Sign Out →
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="main-content">
        {/* New order alert banner */}
        {alertBanner && (
          <div className="alert-banner">
            <span style={{ fontSize: 20 }}>🛒</span>
            <span>{alertBanner}</span>
            <button
              onClick={() => { setAlertBanner(null); router.push('/dashboard/orders'); }}
              className="btn btn-sm"
              style={{ background: 'var(--error)', color: '#fff', marginLeft: 'auto' }}
            >
              View Now
            </button>
          </div>
        )}

        {/* Mobile header */}
        <header className="page-header" style={{ justifyContent: 'space-between' }}>
          <button
            className="btn btn-icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
            style={{ display: 'none', background: 'var(--surface-2)' }}
            id="sidebar-toggle"
          >
            ☰
          </button>
          <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 18 }}>
            TezzNirmaan
          </span>
          {/* B1: Notification bell + order badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell />
            {newOrderCount > 0 && (
              <Link href="/dashboard/orders" style={{ textDecoration: 'none' }}>
                <span className="badge badge-new">
                  {newOrderCount} New
                </span>
              </Link>
            )}
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
