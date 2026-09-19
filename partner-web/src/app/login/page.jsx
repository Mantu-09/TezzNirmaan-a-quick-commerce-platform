'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '../../lib/api';
import useAuthStore from '../../store/authStore';

export default function LoginPage() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const redirectTo    = searchParams.get('redirect') || '/dashboard/orders';
  const { setSession } = useAuthStore();

  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone))  { setError('Enter a valid 10-digit mobile number'); return; }
    if (!password)                { setError('Password is required'); return; }

    setError(''); setLoading(true);
    try {
      const resp = await authApi.staffLogin(`+91${phone}`, password);
      const d    = resp.data;
      const role = d.user?.role;
      
      if (role !== 'shop_owner' && role !== 'shop_staff') {
         setError('Access Denied: You are not a registered shop partner.');
         setLoading(false);
         return;
      }
      
      setSession(
        { ...d.user },
        d.session.accessToken,
        d.session.refreshToken
      );
      router.push('/dashboard/summary');
    } catch (err) {
      setError(err.message || 'Invalid phone number or password');
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
            Welcome back
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28 }}>
            Log in to your shop dashboard
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

          <form onSubmit={handleLogin}>
            {/* Phone */}
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
              Mobile Number
            </label>
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
                data-testid="phone-input"
              />
            </div>

            {/* Password */}
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
              Password
            </label>
            <div style={{ position: 'relative', marginBottom: 24 }}>
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                style={{ width: '100%', paddingRight: 44 }}
                data-testid="password-input"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', fontSize: 18, padding: 0,
                }}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={phone.length !== 10 || !password || loading}
              data-testid="login-btn"
            >
              {loading ? 'Logging in…' : 'Log In →'}
            </button>
          </form>

          <div style={{
            marginTop: 20, padding: '14px 16px',
            background: 'var(--surface-2)', borderRadius: 'var(--r-lg)',
            fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontSize: 13 }}>
              🔒 Partner Portal Access
            </div>
            {[
              { role: 'Shop Owner',       icon: '🏪', note: 'manage orders & inventory'     },
              { role: 'Shop Staff',       icon: '📋', note: 'process live orders'     },
            ].map(({ role, icon, note }) => (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                <span><strong>{role}</strong> — {note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
