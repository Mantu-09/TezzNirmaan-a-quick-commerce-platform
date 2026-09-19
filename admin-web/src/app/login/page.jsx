'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '../../lib/api';
import useAuthStore from '../../store/authStore';

export default function LoginPage() {
  const router        = useRouter();
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
      if (role !== 'platform_admin') {
         setError('Access Denied: You are not a platform administrator.');
         setLoading(false);
         return;
      }
      
      setSession(
        { ...d.user },
        d.session.accessToken,
        d.session.refreshToken
      );
      
      router.push('/admin/analytics');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0D3B6E' }}>
      {/* Left brand panel */}
      <div style={{
        flex: '1', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '48px', maxWidth: 480,
      }} className="hide-mobile">
        <div style={{ fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: -1 }}>
          TezzNirmaan <span style={{ color: '#E8740C'}}>Admin</span>
        </div>
        <div style={{ fontSize: 18, color: '#CBD5E1', marginTop: 12, lineHeight: 1.6 }}>
          Internal Platform Management
        </div>
        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 24 }}>🛡️</span>
            <span style={{ color: '#94A3B8', fontSize: 15 }}>Strictly confidential internal systems</span>
          </div>
        </div>
      </div>

      {/* Right login card */}
      <div style={{
        flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', background: '#f8fafc',
      }}>
        <div className="card card-pad-lg" style={{ width: '100%', maxWidth: 420, background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: '#0D3B6E' }}>
            Admin Login
          </div>
          <div style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>
            Authenticate to access internal controls
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', color: '#ef4444',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 14, marginBottom: 16, fontWeight: 500,
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14, color: '#334155' }}>
              Mobile Number
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <div style={{
                padding: '10px 12px', background: '#f1f5f9',
                border: '1.5px solid #e2e8f0', borderRadius: 8,
                fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap',
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
                style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none' }}
              />
            </div>

            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14, color: '#334155' }}>
              Password
            </label>
            <div style={{ position: 'relative', marginBottom: 24 }}>
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                style={{ width: '100%', padding: '10px 14px', paddingRight: 44, border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', fontSize: 18, padding: 0,
                }}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>

            <button
              type="submit"
              disabled={phone.length !== 10 || !password || loading}
              style={{
                 width: '100%', padding: 14, background: '#E8740C', color: '#fff', 
                 fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer',
                 opacity: (phone.length !== 10 || !password || loading) ? 0.6 : 1
              }}
            >
              {loading ? 'Authenticating...' : 'Secure Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
