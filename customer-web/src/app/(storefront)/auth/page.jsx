// ─────────────────────────────────────────────────────────────
// (storefront)/auth/page.jsx — P9-5
//
// OTP-based phone login for the web storefront.
// Flow:
//   1. Enter phone → POST /auth/otp/send
//   2. Enter 6-digit OTP → POST /auth/otp/verify
//   3. On success: store tn_token cookie, redirect to /storefront/checkout
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams }  from 'next/navigation';
import Cookies from 'js-cookie';

// ─────────────────────────────────────────────────────────────
// P10-3: Cart sync helpers — module-level (outside component)
//
// placeOrder() reads cart from DB cart_items, not request body.
// localStorage items must be pushed to backend on login so that
// checkout can find them. Best-effort — never blocks login.
// API uses /api/backend/* proxy (Next.js → Express :3000).
// ─────────────────────────────────────────────────────────────
const CART_STORAGE_KEY = 'tn_web_cart';

function getLocalCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// P11-7: Cart merge helpers
// ─────────────────────────────────────────────────────────────
function clearLocalCart() {
  try { localStorage.removeItem(CART_STORAGE_KEY); } catch { /* silent */ }
}

async function syncCartAfterLogin(token) {
  const localCart = getLocalCart();
  if (localCart.length === 0) return; // Nothing to sync

  try {
    // 1. Fetch current backend cart (may have items from mobile app / previous session)
    const backendRes = await fetch('/api/backend/customer/cart', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const backendJson  = await backendRes.json().catch(() => ({}));
    const backendItems = backendJson?.data?.items || backendJson?.items || [];

    // 2. Build merged cart: take HIGHER quantity when same inventory_id exists in both
    //    (prevents losing mobile-app items that were in the backend cart)
    const mergedMap = new Map();

    for (const item of backendItems) {
      if (item.inventory_id) mergedMap.set(item.inventory_id, item.quantity || 1);
    }
    for (const item of localCart) {
      if (!item.inventory_id || !item.quantity) continue;
      const existing = mergedMap.get(item.inventory_id) || 0;
      mergedMap.set(item.inventory_id, Math.max(existing, item.quantity));
    }

    if (mergedMap.size === 0) return;

    // 3. Clear backend cart (wipe before repush to avoid duplicates)
    await fetch('/api/backend/customer/cart', {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    // 4. Push merged cart to backend sequentially (avoids race on heavy carts)
    for (const [inventoryId, quantity] of mergedMap.entries()) {
      await fetch('/api/backend/customer/cart/items', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ inventory_id: inventoryId, quantity }),
      });
    }

    // 5. Clear localStorage — backend is now the single source of truth
    clearLocalCart();

  } catch (err) {
    console.warn('[P11-7] Cart merge failed:', err.message);
    sessionStorage.setItem('cart_sync_failed', '1');
  }
}

export default function StorefrontAuthPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') || '/cart';

  const [step,     setStep]     = useState('phone'); // 'phone' | 'otp'
  const [phone,    setPhone]    = useState('');
  const [otp,      setOtp]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [countdown, setCountdown] = useState(0);
  const otpInputRef = useRef(null);

  // Countdown for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleSendOTP = async (e) => {
    e?.preventDefault();
    if (!phone.match(/^[6-9]\d{9}$/)) {
      setError('Enter a valid 10-digit Indian mobile number');
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/backend/auth/otp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: `+91${phone}` }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to send OTP');
      setStep('otp');
      setCountdown(30);
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e?.preventDefault();
    if (otp.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/backend/auth/otp/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: `+91${phone}`, token: otp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Invalid OTP');

      const { access_token, refresh_token } = json.data?.session || {};
      if (access_token) {
        Cookies.set('tn_token',   access_token,  { expires: 7,  sameSite: 'strict' });
        Cookies.set('tn_refresh', refresh_token, { expires: 30, sameSite: 'strict' });
        // P10-3: Sync localStorage cart → backend before redirect.
        // placeOrder() reads from DB cart_items, so this must run first.
        await syncCartAfterLogin(access_token);
      }
      router.push(redirect);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sf-auth-wrap">
      <div className="sf-auth-card">
        {/* Logo */}
        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--sf-primary)', marginBottom: 20 }}>
          Tezz<span style={{ color: 'var(--sf-text)' }}>Nirmaan</span>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleSendOTP}>
            <h1 className="sf-auth-title">Continue to Checkout</h1>
            <p className="sf-auth-sub">We'll send a 6-digit OTP to verify your number.</p>

            <label className="sf-label" htmlFor="phone">Mobile Number</label>
            <div className="sf-input-wrap">
              <div className="sf-country-code">🇮🇳 +91</div>
              <input
                id="phone"
                className="sf-input"
                type="tel"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                placeholder="XXXXXXXXXX"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                autoFocus
                required
              />
            </div>

            {error && <p style={{ color: '#dc2626', fontSize: '0.8125rem', marginBottom: 8 }}>{error}</p>}

            <button type="submit" className="sf-submit-btn" disabled={loading || phone.length < 10}>
              {loading ? 'Sending…' : 'Send OTP →'}
            </button>

            <p className="sf-auth-hint">
              By continuing, you agree to our{' '}
              <a href="/terms"   style={{ color: 'var(--sf-primary)' }}>Terms</a> and{' '}
              <a href="/privacy" style={{ color: 'var(--sf-primary)' }}>Privacy Policy</a>.
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP}>
            <h1 className="sf-auth-title">Enter OTP</h1>
            <p className="sf-auth-sub">Sent to +91 {phone}</p>

            <label className="sf-label" htmlFor="otp">6-digit OTP</label>
            <input
              ref={otpInputRef}
              id="otp"
              className="sf-input otp"
              type="tel"
              inputMode="numeric"
              maxLength={6}
              placeholder="______"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', marginBottom: 14 }}
              required
            />

            {error && <p style={{ color: '#dc2626', fontSize: '0.8125rem', marginBottom: 8 }}>{error}</p>}

            <button type="submit" className="sf-submit-btn" disabled={loading || otp.length < 6}>
              {loading ? 'Verifying…' : 'Verify & Continue →'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              {countdown > 0
                ? <span className="sf-auth-hint">Resend OTP in {countdown}s</span>
                : <button type="button" className="sf-back-link" onClick={handleSendOTP}>Resend OTP</button>
              }
            </div>

            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button type="button" className="sf-back-link" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>
                ← Change number
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
