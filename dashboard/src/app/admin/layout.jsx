'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import useAuthStore from '../../store/authStore';

export default function AdminLayout({ children }) {
  const { role } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (role && role !== 'platform_admin') {
      router.replace('/dashboard');
    }
  }, [role, router]);

  if (role && role !== 'platform_admin') {
    return null;
  }

  const navLinks = [
    { href: '/admin/shops', label: 'Shops', icon: '🏪' },
    { href: '/admin/riders', label: 'Riders', icon: '🏍️' },
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
                }}
              >
                <span>{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </nav>

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
