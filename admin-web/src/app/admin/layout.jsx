'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import useAuthStore from '../../store/authStore';
import { jobsApi, liveAnalyticsApi, payoutsApi } from '../../lib/api';

// ─── Nav Groups ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    title: 'Live Operations',
    items: [
      { href: '/admin/live',       label: 'Live Map'    },
      { href: '/admin/analytics',  label: 'Analytics'   },
      { href: '/admin/operations', label: 'Operations'  },
      { href: '/admin/users',      label: 'Users'       },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { href: '/admin/products',   label: 'Products'    },
      { href: '/admin/categories', label: 'Categories'  },
      { href: '/admin/brands',     label: 'Brands'      },
      { href: '/admin/banners',    label: 'Banners'     },
    ],
  },
  {
    title: 'Orders & Delivery',
    items: [
      { href: '/admin/shops',           label: 'Shops'         },
      { href: '/admin/riders',          label: 'Riders'        },
      { href: '/admin/delivery-zones',  label: 'Zones'         },
      { href: '/admin/reviews',         label: 'Reviews'       },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/admin/settlements', label: 'Settlements'              },
      { href: '/admin/payouts',     label: 'Payouts',  badgeKey: 'payouts' },
      { href: '/admin/cod',         label: 'COD Cash'                },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { href: '/admin/promos',      label: 'Promos'      },
      { href: '/admin/campaigns',   label: 'Campaigns'   },
      { href: '/admin/flash-sales', label: 'Flash Sales' },
      { href: '/admin/broadcasts',  label: 'Broadcasts'  },
      { href: '/admin/nudges',      label: 'Nudges'      },
    ],
  },
  {
    title: 'Growth',
    items: [
      { href: '/admin/retention',     label: 'Retention'  },
      { href: '/admin/b2b',           label: 'B2B'        },
      { href: '/admin/shop-interests',label: 'Leads'      },
      { href: '/admin/investor',      label: 'Investor'   },
    ],
  },
  {
    title: 'Platform',
    items: [
      { href: '/admin/cities',          label: 'Cities'          },
      { href: '/admin/staff-create',    label: 'Create Staff'    },
      { href: '/admin/platform-config', label: 'Platform Config' },
      { href: '/admin/ai-assistant',    label: 'AI Chat'         },
      { href: '/admin/performance',     label: 'Performance'     },
      { href: '/admin/jobs',            label: 'Jobs',  badgeKey: 'jobs' },
    ],
  },
];

const SIDEBAR_W = 220;

export default function AdminLayout({ children }) {
  const { role, user, clearSession } = useAuthStore();
  const router   = useRouter();
  const pathname = usePathname();

  const [hydrated,         setHydrated]         = useState(false);
  const [failedJobCount,   setFailedJobCount]   = useState(0);
  const [activeDeliveries, setActiveDeliveries] = useState(0);
  const [pendingPayouts,   setPendingPayouts]   = useState(0);

  // Fix white page: wait for Zustand to rehydrate from localStorage
  useEffect(() => { setHydrated(true); }, []);

  // Background data fetching (all non-fatal)
  useEffect(() => {
    jobsApi.getFailedJobs({ limit: 1 })
      .then(r => setFailedJobCount(r?.data?.totalFailed || 0)).catch(() => {});

    payoutsApi.listPending({ status: 'pending', limit: 1 })
      .then(r => setPendingPayouts(r?.data?.pending_count || 0)).catch(() => {});

    const loadLive = () =>
      liveAnalyticsApi.getLive()
        .then(r => {
          const d = r?.data?.data || r?.data;
          setActiveDeliveries(d?.today?.active_deliveries || 0);
        }).catch(() => {});
    loadLive();
    const t = setInterval(loadLive, 60_000);
    return () => clearInterval(t);
  }, []);

  // Auth guard (only redirect AFTER hydration so we know the real role)
  useEffect(() => {
    if (!hydrated) return;
    if (!role) { router.replace('/login'); return; }
    if (role !== 'platform_admin') router.replace('/dashboard');
  }, [hydrated, role, router]);

  // ── Loading spinner while Zustand rehydrates ───────────────────────────────
  if (!hydrated || !role) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f1f5f9',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid #e2e8f0',
          borderTopColor: '#E8740C',
          borderRadius: '50%',
          animation: 'tn-spin 0.7s linear infinite',
        }} />
        <span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>Loading admin panel…</span>
        <style>{`@keyframes tn-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (role !== 'platform_admin') return null;

  const badges     = { jobs: failedJobCount, payouts: pendingPayouts };
  const isActive   = (href) => pathname === href || pathname.startsWith(href + '/');
  const activeLabel = NAV_GROUPS.flatMap(g => g.items).find(i => isActive(i.href))?.label || 'Admin';

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#f1f5f9',
      fontFamily: 'var(--font, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif)',
    }}>

      {/* ══ LEFT SIDEBAR ════════════════════════════════════════════════════════ */}
      <aside style={{
        width: SIDEBAR_W,
        minWidth: SIDEBAR_W,
        background: '#0D3B6E',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        boxShadow: '2px 0 12px rgba(0,0,0,0.12)',
        zIndex: 40,
        flexShrink: 0,
      }}>

        {/* Brand header */}
        <div style={{
          padding: '18px 14px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: '#E8740C',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 18, color: '#fff', flexShrink: 0,
            }}>T</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', lineHeight: 1.2 }}>
                TezzNirmaan
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#E8740C',
                textTransform: 'uppercase', letterSpacing: '1px',
              }}>Admin Panel</div>
            </div>
          </div>
        </div>

        {/* Live delivery badge */}
        {activeDeliveries > 0 && (
          <div style={{
            margin: '10px 10px 0',
            padding: '7px 11px',
            background: 'rgba(34,197,94,0.13)',
            border: '1px solid rgba(34,197,94,0.28)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#22c55e',
              flexShrink: 0,
              animation: 'tn-pulse 1.5s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 11, color: '#86efac', fontWeight: 600 }}>
              {activeDeliveries} active {activeDeliveries === 1 ? 'delivery' : 'deliveries'}
            </span>
          </div>
        )}

        {/* Nav groups */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px 6px' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.title} style={{ marginBottom: 2 }}>
              {/* Group label */}
              <div style={{
                fontSize: 9, fontWeight: 700,
                color: 'rgba(255,255,255,0.3)',
                textTransform: 'uppercase', letterSpacing: '1.2px',
                padding: '10px 8px 3px',
              }}>
                {group.title}
              </div>

              {group.items.map((item) => {
                const badge  = item.badgeKey ? badges[item.badgeKey] : 0;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: 6,
                      marginBottom: 1,
                      fontSize: 13,
                      fontWeight: active ? 700 : 400,
                      color: active ? '#fff' : 'rgba(255,255,255,0.6)',
                      background: active ? 'rgba(232,116,12,0.25)' : 'transparent',
                      borderLeft: active ? '2px solid #E8740C' : '2px solid transparent',
                      textDecoration: 'none',
                      transition: 'all 0.1s ease',
                      paddingLeft: active ? 9 : 10,
                    }}
                  >
                    <span>{item.label}</span>
                    {badge > 0 && (
                      <span style={{
                        minWidth: 17, height: 17, borderRadius: 9,
                        background: '#ef4444', color: '#fff',
                        fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 4px', flexShrink: 0,
                      }}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar footer: user info + logout */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '10px 8px 14px',
          flexShrink: 0,
        }}>
          {/* User info */}
          <div style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.06)',
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
              {user?.full_name || 'Platform Admin'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>
              {user?.phone || 'platform_admin'}
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              color: '#fca5a5',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.22)',
              cursor: 'pointer', textAlign: 'center',
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* ══ MAIN AREA ═══════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 24px',
          height: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 30,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          flexShrink: 0,
        }}>
          {/* Page title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400 }}>Admin</span>
            <span style={{ color: '#cbd5e1' }}>/</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{activeLabel}</span>
          </div>

          {/* Top-right quick links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeDeliveries > 0 && (
              <Link href="/admin/live" style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 6,
                fontSize: 12, fontWeight: 600,
                color: '#16a34a',
                background: 'rgba(22,163,74,0.08)',
                border: '1px solid rgba(22,163,74,0.2)',
                textDecoration: 'none',
              }}>
                <span style={{ fontSize: 8 }}>●</span> {activeDeliveries} Live
              </Link>
            )}
            <Link href="/admin/analytics" style={{
              padding: '4px 10px', borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              color: '#0D3B6E',
              background: 'rgba(13,59,110,0.06)',
              border: '1px solid rgba(13,59,110,0.14)',
              textDecoration: 'none',
            }}>
              Analytics
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>

      <style>{`
        @keyframes tn-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        aside::-webkit-scrollbar       { width: 3px; }
        aside::-webkit-scrollbar-track { background: transparent; }
        aside::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
        nav a:hover { color: rgba(255,255,255,0.9) !important; background: rgba(255,255,255,0.06) !important; }
      `}</style>
    </div>
  );
}
