'use client';
// (storefront)/components/PWAInstallBanner.jsx — P16-4
// Detects beforeinstallprompt and shows an "Add to Home Screen" banner.
// Persists dismissal. Works on Android Chrome & Samsung Internet.
import { useEffect, useState } from 'react';

export default function PWAInstallBanner() {
  const [prompt, setPrompt]       = useState(null);
  const [visible, setVisible]     = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed this session
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (sessionStorage.getItem('pwa_banner_dismissed')) return;

    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      // Show after 30s delay on first interaction or 2nd visit
      const visits = +(localStorage.getItem('tn_visit_count') || 0) + 1;
      localStorage.setItem('tn_visit_count', String(visits));
      const delay = visits >= 2 ? 5000 : 30000;
      setTimeout(() => setVisible(true), delay);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!prompt) return;
    setInstalling(true);
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setInstalling(false);
    if (outcome === 'accepted') {
      setVisible(false);
      localStorage.setItem('pwa_installed', '1');
    }
  }

  function dismiss() {
    setVisible(false);
    sessionStorage.setItem('pwa_banner_dismissed', '1');
  }

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 9999,
      background: '#1f2937', borderRadius: 16, padding: '16px 18px',
      boxShadow: '0 8px 32px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', gap: 14,
      animation: 'slideUp .3s ease',
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
      {/* Icon */}
      <div style={{ width: 44, height: 44, background: '#f97316', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 24 }}>
        🏗️
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 2 }}>Add TezzNirmaan to Home Screen</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Faster access &middot; Works offline &middot; Order updates</div>
      </div>
      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={dismiss} style={{ padding: '6px 10px', background: 'rgba(255,255,255,.1)', color: '#9ca3af', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>
          Later
        </button>
        <button onClick={handleInstall} disabled={installing} style={{ padding: '6px 14px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          {installing ? '...' : 'Install'}
        </button>
      </div>
    </div>
  );
}
