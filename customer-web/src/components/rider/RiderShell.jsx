'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import useAuthStore from '../../store/authStore';
import { api } from '../../lib/api';

// ── Rider Portal Nav ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/rider',            icon: '🏠', label: 'Home'          },
  { href: '/rider/deliveries', icon: '📦', label: 'Deliveries'    },
  { href: '/rider/earnings',   icon: '💰', label: 'Earnings'      },
  { href: '/rider/history',    icon: '📜', label: 'History'       },
  { href: '/rider/payouts',    icon: '💳', label: 'Payouts'       },
  { href: '/rider/bank',       icon: '🏦', label: 'Bank Account'  },
  { href: '/rider/kyc',        icon: '📄', label: 'KYC Documents' },
  { href: '/rider/support',    icon: '🎧', label: 'Support'       },
];

const SIDEBAR_W = 230;

export default function RiderShell({ children }) {
  const { role, user, clearSession } = useAuthStore();
  const router   = useRouter();
  const pathname = usePathname();

  const [hydrated,     setHydrated]     = useState(false);
  const [isOnline,     setIsOnline]     = useState(false);
  const [todayEarning, setTodayEarning] = useState(0);
  const [toggling,     setToggling]     = useState(false);

  // Fix white flash: wait for Zustand rehydration
  useEffect(() => { setHydrated(true); }, []);

  // Auth guard
  useEffect(() => {
    if (!hydrated) return;
    if (!role) { router.replace('/login'); return; }
    if (role !== 'rider') router.replace('/dashboard/orders');
  }, [hydrated, role, router]);

  // Load rider status + today earnings
  useEffect(() => {
    if (!hydrated || role !== 'rider') return;
    api.get('/rider/status')
      .then(r => setIsOnline(r?.data?.is_online || false))
      .catch(() => {});
    api.get('/rider/earnings-summary')
      .then(r => setTodayEarning(r?.data?.today_paise || 0))
      .catch(() => {});
  }, [hydrated, role]);

  const handleToggleOnline = useCallback(async () => {
    if (toggling) return;
    setToggling(true);
    const next = !isOnline;
    try {
      await api.patch('/rider/status', { is_online: next });
      setIsOnline(next);
    } catch {
      // revert silently
    } finally {
      setToggling(false);
    }
  }, [isOnline, toggling]);

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  // ── Loading splash ────────────────────────────────────────────
  if (!hydrated || !role) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f1f5f9',
        flexDirection: 'column', gap: 14,
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #e2e8f0',
          borderTopColor: '#f97316', borderRadius: '50%',
          animation: 'rdr-spin 0.7s linear infinite',
        }} />
        <span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
          Loading rider portal…
        </span>
        <style>{`@keyframes rdr-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (role !== 'rider') return null;

  const isActive = (href) =>
    href === '/rider' ? pathname === '/rider' : pathname.startsWith(href);

  const fmtRupees = (p) => `₹${Math.floor((p || 0) / 100)}`;
  const activeLabel = NAV_ITEMS.find(n => isActive(n.href))?.label || 'Portal';

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', background: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    }}>

      {/* ══ SIDEBAR ══════════════════════════════════════════════════ */}
      <aside style={{
        width: SIDEBAR_W, minWidth: SIDEBAR_W, background: '#111827',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
        overflowY: 'auto', zIndex: 40, flexShrink: 0,
        boxShadow: '2px 0 14px rgba(0,0,0,0.2)',
      }}>

        {/* Brand header */}
        <div style={{ padding: '18px 14px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, background: '#E8740C',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}>🛵</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', lineHeight: 1.2 }}>TezzNirmaan</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Rider Portal
              </div>
            </div>
          </div>
        </div>

        {/* Online / Offline toggle */}
        <div style={{
          margin: '12px 10px 4px', padding: '11px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${isOnline ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Availability
          </div>
          <button
            onClick={handleToggleOnline}
            disabled={toggling}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none',
              cursor: toggling ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13,
              transition: 'all 0.2s',
              background: isOnline ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
              color: isOnline ? '#86efac' : '#fca5a5',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: isOnline ? '#22c55e' : '#ef4444',
              display: 'inline-block',
              animation: isOnline ? 'rdr-pulse 1.5s infinite' : 'none',
            }} />
            {toggling ? 'Updating…' : isOnline ? 'GO OFFLINE' : 'GO ONLINE'}
          </button>
        </div>

        {/* Today earnings chip */}
        <div style={{ margin: '4px 10px 8px', padding: '10px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.09)', border: '1px solid rgba(249,115,22,0.18)' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Today's Earnings
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f97316', marginTop: 3 }}>
            {fmtRupees(todayEarning)}
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 6px' }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 7, marginBottom: 1,
                  fontSize: 13, fontWeight: active ? 700 : 400,
                  color: active ? '#fff' : 'rgba(255,255,255,0.52)',
                  background: active ? 'rgba(249,115,22,0.18)' : 'transparent',
                  borderLeft: active ? '2px solid #f97316' : '2px solid transparent',
                  textDecoration: 'none', transition: 'all 0.1s ease',
                  paddingLeft: active ? 9 : 10,
                }}
              >
                <span style={{ fontSize: 16, minWidth: 22, textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer: user info + sign out */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '10px 8px 16px', flexShrink: 0 }}>
          <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
              {user?.full_name || 'Rider'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.33)', marginTop: 2 }}>
              {user?.phone || ''}
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 6,
              fontSize: 12, fontWeight: 600, color: '#fca5a5',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              cursor: 'pointer', textAlign: 'center',
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* ══ MAIN CONTENT ═════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <header style={{
          background: '#fff', borderBottom: '1px solid #e2e8f0',
          padding: '0 24px', height: 50, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>Rider</span>
            <span style={{ color: '#cbd5e1' }}>/</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{activeLabel}</span>
          </div>
          {/* Status pill in topbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            color: isOnline ? '#16a34a' : '#dc2626',
            background: isOnline ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.06)',
            border: `1px solid ${isOnline ? 'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.14)'}`,
          }}>
            <span style={{ fontSize: 8 }}>●</span>
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </header>

        {/* Page */}
        <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>

      <style>{`
        @keyframes rdr-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes rdr-spin   { to { transform: rotate(360deg); } }
        aside::-webkit-scrollbar       { width: 3px; }
        aside::-webkit-scrollbar-track { background: transparent; }
        aside::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        nav a:hover { color: rgba(255,255,255,0.9) !important; background: rgba(255,255,255,0.06) !important; }
      `}</style>
    </div>
  );
}
