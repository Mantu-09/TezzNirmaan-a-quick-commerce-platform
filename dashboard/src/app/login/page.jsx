'use client';
import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '../../lib/api';
import useAuthStore from '../../store/authStore';

export default function LoginPage() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const redirectTo    = searchParams.get('redirect') || '/dashboard/orders';
  const { setSession } = useAuthStore();

  const [step,    setStep]    = useState('phone'); // 'phone' | 'otp'
  const [phone,   setPhone]   = useState('');
  const [otp,     setOtp]     = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const inputRefs = useRef([]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone)) { setError('Enter a valid 10-digit mobile number'); return; }
    setError(''); setLoading(true);
    try {
      await authApi.requestOtp(`+91${phone}`);
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const handleOtpChange = (idx, val) => {
    const digit = val.replace(/\D/, '').slice(-1);
    const next  = [...otp];
    next[idx]   = digit;
    setOtp(next);
    if (digit && idx < 5) inputRefs.current[idx + 1]?.focus();
    if (next.every(d => d !== '')) verifyOtp(next.join(''));
  };

  const handleOtpKey = (idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const verifyOtp = async (code) => {
    setLoading(true); setError('');
    try {
      const data = await authApi.verifyOtp(`+91${phone}`, code);
      setSession(data.user, data.token);
      router.push(data.user?.role === 'rider' ? '/rider' : redirectTo);
    } catch (err) {
      setError('Incorrect OTP. Please try again.');
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--sidebar-bg)' }}>
      {/* Left brand panel */}
      <div style={{
        flex: '1', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '48px', maxWidth: 480,
      }} className="hide-mobile">
        <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--primary)', letterSpacing: -1 }}>
          TezzNirmaan
        </div>
        <div style={{ fontSize: 18, color: '#CBD5E1', marginTop: 12, lineHeight: 1.6 }}>
          Shop Owner Dashboard
        </div>
        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[
            { emoji: '🛒', text: 'Live order queue with instant alerts' },
            { emoji: '📦', text: 'Inventory management in seconds'      },
            { emoji: '🛵', text: 'Delivery tracking and assignment'     },
            { emoji: '📊', text: "Today's summary at a glance"          },
          ].map(item => (
            <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 24 }}>{item.emoji}</span>
              <span style={{ color: '#94A3B8', fontSize: 15 }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right login card */}
      <div style={{
        flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', background: 'var(--bg)',
      }}>
        <div className="card card-pad-lg" style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            {step === 'phone' ? 'Welcome back' : 'Enter OTP'}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28 }}>
            {step === 'phone'
              ? 'Log in to your shop dashboard'
              : `OTP sent to +91 ${phone}`}
          </div>

          {error && (
            <div style={{
              background: 'var(--error-light)', color: 'var(--error)',
              borderRadius: 'var(--r-lg)', padding: '10px 14px',
              fontSize: 14, marginBottom: 16, fontWeight: 500,
            }}>
              ⚠️ {error}
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp}>
              <label>Mobile Number</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <div style={{
                  padding: '10px 12px', background: 'var(--surface-2)',
                  border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)',
                  fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                }}>
                  +91
                </div>
                <input
                  className="input"
                  type="tel"
                  inputMode="numeric"
                  placeholder="10-digit number"
                  maxLength={10}
                  value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }}
                  autoFocus
                  style={{ flex: 1 }}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={phone.length !== 10 || loading}
              >
                {loading ? 'Sending…' : 'Send OTP →'}
              </button>
            </form>
          ) : (
            <div>
              {/* 6-box OTP */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => inputRefs.current[i] = el}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKey(i, e)}
                    autoFocus={i === 0}
                    style={{
                      width: 52, height: 60, textAlign: 'center',
                      fontSize: 24, fontWeight: 700, border: '2px solid var(--border)',
                      borderRadius: 'var(--r-lg)', background: digit ? 'var(--primary-light)' : 'var(--surface)',
                      borderColor: digit ? 'var(--primary)' : 'var(--border)',
                      outline: 'none', fontFamily: 'var(--font)',
                    }}
                  />
                ))}
              </div>
              <button
                className="btn btn-primary btn-full btn-lg"
                disabled={otp.some(d => !d) || loading}
                onClick={() => verifyOtp(otp.join(''))}
              >
                {loading ? 'Verifying…' : 'Verify & Log In'}
              </button>
              <button
                className="btn btn-ghost btn-full"
                style={{ marginTop: 12 }}
                onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError(''); }}
              >
                ← Change Number
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
