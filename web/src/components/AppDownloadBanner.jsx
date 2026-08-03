'use client';
// ─────────────────────────────────────────────────────────────
// AppDownloadBanner.jsx — P9-5
// Sticky "Download the App" CTA shown only on mobile screens.
// Appears at the bottom of the screen, over the content.
// Dismissed by the user or after 30 seconds.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=in.tezznirmaan.app';
const APP_STORE_URL  = 'https://apps.apple.com/in/app/tezznirmaan/id0000000000'; // Replace with real App Store ID

export default function AppDownloadBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only show on mobile viewports
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    // Don't show if user dismissed in this session
    const sessionDismissed = sessionStorage.getItem('app_banner_dismissed');
    if (sessionDismissed) return;

    // Small delay before showing (avoids banner flashing on page load)
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    sessionStorage.setItem('app_banner_dismissed', '1');
  };

  // Detect platform for store link
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const storeUrl = isIOS ? APP_STORE_URL : PLAY_STORE_URL;
  const storeLabel = isIOS ? 'App Store' : 'Google Play';

  if (!visible || dismissed) return null;

  return (
    <>
      {/* Backdrop push — prevents content being hidden behind banner */}
      <div style={{ height: 72 }} aria-hidden="true" />

      <div
        role="banner"
        aria-label="Download TezzNirmaan app"
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          zIndex: 100,
          backgroundColor: '#fff',
          borderTop: '1px solid var(--border)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
          animation: 'slideUp 0.3s ease',
        }}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: none; } }`}</style>

        {/* App icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          backgroundColor: '#E8521A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          🏗️
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>TezzNirmaan App</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>Faster ordering, live tracking</div>
        </div>

        {/* CTA */}
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            backgroundColor: '#E8521A', color: '#fff',
            padding: '8px 14px', borderRadius: 8,
            fontSize: 13, fontWeight: 700, flexShrink: 0,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
          aria-label={`Download TezzNirmaan from ${storeLabel}`}
        >
          Get App
        </a>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss app download banner"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', fontSize: 18, padding: 4, flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
    </>
  );
}
