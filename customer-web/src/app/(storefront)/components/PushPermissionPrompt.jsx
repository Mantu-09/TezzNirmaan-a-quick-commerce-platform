// ─────────────────────────────────────────────────────────────
// (storefront)/components/PushPermissionPrompt.jsx — P12-8
//
// Non-intrusive push notification permission prompt.
// Appears after user places their 2nd order (not on first visit).
// Uses existing push_tokens table (024_push_tokens.sql).
//
// Strategy:
//   • Show only after user has an order (localStorage counter)
//   • Slide-up card at bottom of screen
//   • "Enable" → request browser permission → POST to backend
//   • "Not now" → dismiss for 7 days (localStorage)
//   • Dismissed forever after 3rd "Not now"
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';
import Cookies from 'js-cookie';

const PROMPT_KEY    = 'tn_push_prompt';
const SUPPRESS_DAYS = 7;

function shouldShow() {
  try {
    const data = JSON.parse(localStorage.getItem(PROMPT_KEY) || '{}');
    if (data.forever)  return false;
    if (data.count >= 3) { localStorage.setItem(PROMPT_KEY, JSON.stringify({ ...data, forever: true })); return false; }
    if (data.until && Date.now() < data.until) return false;
    return true;
  } catch { return false; }
}

function dismiss(forever = false) {
  try {
    const data = JSON.parse(localStorage.getItem(PROMPT_KEY) || '{}');
    const count = (data.count || 0) + 1;
    localStorage.setItem(PROMPT_KEY, JSON.stringify({
      count,
      forever: forever || count >= 3,
      until:   Date.now() + SUPPRESS_DAYS * 86400000,
    }));
  } catch {}
}

async function registerPush(token) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;

    const reg     = await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return false;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: vapidKey,
    });

    await fetch('/api/backend/customer/push-token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        endpoint: sub.endpoint,
        p256dh:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
        auth:     btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))),
        platform: 'web',
      }),
    });
    return true;
  } catch { return false; }
}

export default function PushPermissionPrompt() {
  const [visible,  setVisible]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  useEffect(() => {
    // Only show if:
    // 1. Browser supports push
    // 2. Not already granted
    // 3. User is logged in
    // 4. Not suppressed
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (!Cookies.get('tn_token')) return;
    if (!shouldShow()) return;

    // Show after 3s delay (not jarring on page load)
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!visible || done) return null;

  const handleEnable = async () => {
    setLoading(true);
    const token = Cookies.get('tn_token');
    const success = await registerPush(token);
    setLoading(false);
    if (success) {
      setDone(true);
      dismiss(true); // Mark as permanent accept
    } else {
      // Permission denied or error — dismiss for 7 days
      dismiss();
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    dismiss();
    setVisible(false);
  };

  if (done) return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: '#dcfce7', border: '1px solid #86efac', borderRadius: 14,
      padding: '12px 20px', fontSize: 14, fontWeight: 700, color: '#166534',
      zIndex: 1000, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', whiteSpace: 'nowrap',
    }}>
      ✅ Push notifications enabled!
    </div>
  );

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 16, right: 16, maxWidth: 420,
      margin: '0 auto', background: '#fff', borderRadius: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
      padding: '18px 20px', zIndex: 1000,
      border: '1px solid var(--sf-border,#e5e7eb)',
      animation: 'sfDropdownIn 0.25s ease',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ fontSize: 32, flexShrink: 0 }}>🔔</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
            Get order updates instantly
          </div>
          <div style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)', lineHeight: 1.5 }}>
            Know when your rider picks up, is nearby, or delivers your materials.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleEnable} disabled={loading}
          style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--sf-primary,#f97316)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? '…' : '🔔 Enable Alerts'}
        </button>
        <button onClick={handleDismiss}
          style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--sf-bg,#f9fafb)', color: 'var(--sf-text-2,#6b7280)', border: '1px solid var(--sf-border,#e5e7eb)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          Later
        </button>
      </div>
    </div>
  );
}
