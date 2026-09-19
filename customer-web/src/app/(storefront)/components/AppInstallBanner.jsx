'use client';
// ─────────────────────────────────────────────────────────────
// AppInstallBanner.jsx — P11-4
//
// P11-4 upgrade over P10-7:
//   - Intercepts `beforeinstallprompt` → true native PWA install
//     (no Play Store redirect when Chrome deems the app installable)
//   - Falls back to Play Store link on Android if no native prompt
//     (older Android, non-Chrome browsers, or timing issue)
//   - `appinstalled` event hides banner immediately after install
//
// Logic:
//   1. Listen for beforeinstallprompt → store event, set mode='pwa'
//   2. If Android + no native prompt after 30s → mode='playstore'
//   3. handleInstall:
//      - pwa mode  → call stored event.prompt(), check userChoice
//      - playstore → open Play Store tab + dismiss
//
// Dismiss TTL: 7 days (same as P10-7, same localStorage key)
// Not shown: already installed (standalone mode), recently dismissed
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';

const DISMISS_KEY    = 'tn_app_banner_dismissed';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FALLBACK_DELAY = 30_000;                    // 30s before showing Play Store fallback

export function AppInstallBanner() {
  const [show,        setShow]        = useState(false);
  const [installMode, setInstallMode] = useState('pwa'); // 'pwa' | 'playstore'
  const deferredPromptRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Already dismissed recently?
    const ts = localStorage.getItem(DISMISS_KEY);
    if (ts && Date.now() - Number(ts) < DISMISS_TTL_MS) return;

    // Already running as installed PWA?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true; // iOS Safari
    if (isStandalone) return;

    // ── beforeinstallprompt — fires when Chrome decides app is installable
    // (HTTPS + manifest with icons + SW registered)
    const handleInstallPrompt = (e) => {
      e.preventDefault();              // Stop Chrome's automatic mini-bar
      deferredPromptRef.current = e;
      setInstallMode('pwa');
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    // Hide immediately once user installs via our prompt or any other path
    const handleAppInstalled = () => {
      setShow(false);
      deferredPromptRef.current = null;
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // ── Android fallback — if no native prompt arrives within 30s,
    // show the Play Store link as a fallback (covers non-Chrome, old Android)
    const isAndroid = /Android/i.test(navigator.userAgent);
    let fallbackTimer = null;
    if (isAndroid) {
      fallbackTimer = setTimeout(() => {
        if (!deferredPromptRef.current && !show) {
          setInstallMode('playstore');
          setShow(true);
        }
      }, FALLBACK_DELAY);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShow(false);
  };

  const handleInstall = async () => {
    if (installMode === 'pwa' && deferredPromptRef.current) {
      // Trigger native Chrome install dialog
      deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;
      if (outcome === 'accepted') {
        setShow(false);
      }
      deferredPromptRef.current = null; // Can only be used once
    } else {
      // Play Store fallback
      window.open(
        'https://play.google.com/store/apps/details?id=in.tezznirmaan.app',
        '_blank',
        'noopener,noreferrer'
      );
      dismiss();
    }
  };

  if (!show) return null;

  return (
    <div className="sf-app-banner" role="complementary" aria-label="Install TezzNirmaan app">
      <div className="sf-app-banner-icon">
        <img src="/icons/icon-192.png" alt="TezzNirmaan" width={44} height={44} />
      </div>

      <div className="sf-app-banner-text">
        <strong>TezzNirmaan</strong>
        <span>
          {installMode === 'pwa'
            ? 'Install for live tracking & offline browsing'
            : 'Get live tracking on the app'}
        </span>
      </div>

      <button
        className="sf-app-banner-btn"
        onClick={handleInstall}
        aria-label={installMode === 'pwa' ? 'Install TezzNirmaan app' : 'Get TezzNirmaan on Google Play'}
      >
        {installMode === 'pwa' ? 'Install' : 'Get App'}
      </button>

      <button
        className="sf-app-banner-close"
        onClick={dismiss}
        aria-label="Dismiss app install banner"
      >
        ✕
      </button>
    </div>
  );
}
