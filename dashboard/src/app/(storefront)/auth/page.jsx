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

export default function StorefrontAuthPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('redirect') || '/storefront/cart';

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
