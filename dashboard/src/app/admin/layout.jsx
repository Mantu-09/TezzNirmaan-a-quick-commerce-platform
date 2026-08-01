'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import useAuthStore from '../../store/authStore';
import { supportApi, jobsApi } from '../../lib/api';

export default function AdminLayout({ children }) {
  const { role } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount,    setUnreadCount]    = useState(0); // P7-4: Freshchat badge
  const [failedJobCount, setFailedJobCount] = useState(0); // P7-7: DLQ badge

  // P7-4: Fetch open conversation count from Freshchat REST API
  useEffect(() => {
    supportApi.getUnreadCount()
      .then(count => setUnreadCount(count))
      .catch(() => {}); // non-fatal — badge stays at 0 if API call fails
  }, []);

  // P7-7: Fetch total failed job count for sidebar badge
  useEffect(() => {
    jobsApi.getFailedJobs({ limit: 1 })
      .then(res => setFailedJobCount(res?.data?.totalFailed || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (role && role !== 'platform_admin') {
      router.replace('/dashboard');
    }
  }, [role, router]);

  if (role && role !== 'platform_admin') {
    return null;
  }

  const navLinks = [
    { href: '/admin/analytics',      label: 'Analytics', icon: '📊' }, // P2-A
    { href: '/admin/shops',          label: 'Shops',     icon: '🏪' },
    { href: '/admin/riders',         label: 'Riders',    icon: '🏍️' },
    { href: '/admin/promos',         label: 'Promos',    icon: '🏷️' }, // P1-C
    { href: '/admin/campaigns',      label: 'Campaigns', icon: '📣' }, // P8-3
    { href: '/admin/cities',         label: 'Cities',    icon: '🏙️' }, // P4-4A
    { href: '/admin/shop-interests', label: 'Leads',     icon: '📋' }, // P5-0D Bug 5
    { href: '/admin/jobs',           label: 'Jobs',      icon: '⚙️', badge: failedJobCount }, // P7-7
  ];

  const isActive = (href) => pathname === href || pathname.startsWith(href + '/');

  return (
    <div style={{ fontFamily: 'var(--font)', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Admin Top Bar */}
      <header
        style={{
          background: 'linear-gradient(135deg, var(--secondary) 0%, #0a2d52 100%)',
          color: '#fff',
          boxShadow: '0 2px 16px rgba(13,59,110,0.25)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '0 var(--s6)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s6)',
            height: 56,
          }}
        >
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              T
            </span>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.5px' }}>
              TezzNirmaan
            </span>
            <span
              style={{
                background: 'rgba(232,116,12,0.2)',
                border: '1px solid rgba(232,116,12,0.4)',
                color: '#f0a050',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Admin
            </span>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)' }} />

          {/* Nav Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 'var(--r-md)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: isActive(link.href) ? '#fff' : 'rgba(255,255,255,0.65)',
                  background: isActive(link.href) ? 'rgba(232,116,12,0.25)' : 'transparent',
                  border: isActive(link.href)
                    ? '1px solid rgba(232,116,12,0.4)'
                    : '1px solid transparent',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <span>{link.icon}</span>
                {link.label}
                {/* P7-7: Red badge for failed jobs */}
                {link.badge > 0 && (
                  <span style={{
                    position:        'absolute',
                    top:             -6,
                    right:           -6,
                    minWidth:        18,
                    height:          18,
                    borderRadius:    9,
                    backgroundColor: '#ef4444',
                    color:           '#fff',
                    fontSize:        10,
                    fontWeight:      700,
                    display:         'flex',
                    alignItems:      'center',
                    justifyContent:  'center',
                    padding:         '0 4px',
                    animation:       'dlq-pulse 1.5s ease-in-out infinite',
                  }}>
                    {link.badge > 99 ? '99+' : link.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* P7-4: Freshchat Support Inbox link */}
          <a
            href="https://web.freshchat.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            6,
              padding:        '6px 14px',
              borderRadius:   'var(--r-md)',
              fontSize:       13,
              fontWeight:     600,
              color:          'rgba(255,255,255,0.85)',
              background:     'rgba(255,255,255,0.08)',
              border:         '1px solid rgba(255,255,255,0.18)',
              textDecoration: 'none',
              transition:     'all 0.15s ease',
              position:       'relative',
            }}
          >
            <span>💬</span>
            Support
            {unreadCount > 0 && (
              <span style={{
                position:        'absolute',
                top:             -6,
                right:           -6,
                minWidth:        18,
                height:          18,
                borderRadius:    9,
                backgroundColor: '#EF4444',
                color:           '#fff',
                fontSize:        10,
                fontWeight:      700,
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                padding:         '0 4px',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </a>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Back to Dashboard */}
          <Link
            href="/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'rgba(255,255,255,0.55)',
              textDecoration: 'none',
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.12)',
              transition: 'all 0.15s',
            }}
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      {/* Page Content */}
      <main
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: 'var(--s6)',
          minHeight: 'calc(100vh - 56px)',
        }}
      >
        {children}
      </main>
    </div>
  );
}
