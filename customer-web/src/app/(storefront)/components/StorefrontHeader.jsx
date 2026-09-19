// ─────────────────────────────────────────────────────────────────────────────
// StorefrontHeader.jsx — Blinkit-style navbar with OTP login modal
// ─────────────────────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect, useRef } from 'react';
import Link                             from 'next/link';
import { useRouter }                    from 'next/navigation';
import Cookies                          from 'js-cookie';
import { useCart }                      from './CartProvider';
import { useCity }                      from './CityProvider';
import dynamic                          from 'next/dynamic';

const WalletBadge      = dynamic(() => import('./WalletBadge'),      { ssr: false });
const NotificationBell = dynamic(() => import('./NotificationBell'), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:3000';

// ── Blinkit-style OTP Modal ───────────────────────────────────────────────────
function OtpModal({ onClose, onSuccess }) {
  const [step,    setStep]    = useState('phone');
  const [phone,   setPhone]   = useState('');
  const [otp,     setOtp]     = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [timer,   setTimer]   = useState(0);
  const phoneRef = useRef(null);
  const otpRefs  = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  useEffect(() => { phoneRef.current?.focus(); }, []);
  useEffect(() => { if (step === 'otp') otpRefs[0].current?.focus(); }, [step]);
  useEffect(() => {
    if (timer <= 0) return;
    const t = setInterval(() => setTimer(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [timer]);

  // Handle 6-box OTP input
  function handleOtpChange(idx, val) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    setError('');
    if (digit && idx < 5) otpRefs[idx + 1].current?.focus();
  }
  function handleOtpKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs[idx - 1].current?.focus();
    }
  }
  function handleOtpPaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(''));
      otpRefs[5].current?.focus();
    }
    e.preventDefault();
  }

  async function sendOtp(e) {
    e?.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) { setError('Enter a valid 10-digit mobile number'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${digits}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to send OTP');
      setStep('otp'); setTimer(30);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally { setLoading(false); }
  }

  async function verifyOtp(e) {
    e?.preventDefault();
    const digits    = phone.replace(/\D/g, '');
    const otpString = otp.join('');
    if (otpString.length !== 6) { setError('Enter the complete 6-digit OTP'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${digits}`, otp: otpString }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Invalid OTP');
      const { session } = data.data;
      Cookies.set('tn_token',   session.accessToken,  { expires: 7,  sameSite: 'lax' });
      Cookies.set('tn_refresh', session.refreshToken, { expires: 30, sameSite: 'lax' });
      onSuccess({ phone: `+91${digits}` });
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally { setLoading(false); }
  }

  const otpFilled = otp.join('').length === 6;
  const phoneFilled = phone.replace(/\D/g, '').length === 10;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 20,
        width: '100%', maxWidth: 380,
        padding: '36px 28px 28px',
        position: 'relative',
        boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
        animation: 'sf-slide-up 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        textAlign: 'center',
      }}>

        {/* Back arrow */}
        {step === 'otp' && (
          <button
            onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError(''); }}
            style={{
              position: 'absolute', top: 16, left: 16,
              width: 32, height: 32, border: 'none', background: 'none',
              cursor: 'pointer', fontSize: 20, color: '#334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >←</button>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, border: 'none', background: '#f1f5f9',
            borderRadius: '50%', cursor: 'pointer', fontSize: 18, color: '#64748b',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'inherit', lineHeight: 1,
          }}
        >×</button>

        {/* App icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'linear-gradient(135deg, #E8740C 0%, #c96200 100%)',
          margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(232,116,12,0.35)',
        }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: 'inherit' }}>T</span>
        </div>

        {/* Title */}
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
          {step === 'phone' ? "India's quick commerce app" : 'Enter OTP'}
        </div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
          {step === 'phone'
            ? 'Log in or Sign up'
            : `Sent to +91 ${phone.replace(/\D/g,'')}`}
        </div>

        {/* Phone step */}
        {step === 'phone' && (
          <form onSubmit={sendOtp} style={{ textAlign: 'left' }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              border: '1.5px solid #e2e8f0', borderRadius: 12,
              overflow: 'hidden', marginBottom: 14,
              background: '#f8fafc',
              transition: 'border-color 0.15s',
            }}
              onFocusCapture={e => e.currentTarget.style.borderColor = '#E8740C'}
              onBlurCapture={e  => e.currentTarget.style.borderColor = '#e2e8f0'}
            >
              <div style={{
                padding: '0 14px',
                height: 50,
                display: 'flex', alignItems: 'center',
                fontWeight: 700, fontSize: 15, color: '#334155',
                borderRight: '1.5px solid #e2e8f0',
                flexShrink: 0, background: '#fff',
              }}>+91</div>
              <input
                ref={phoneRef}
                type="tel" inputMode="numeric" maxLength={10}
                placeholder="Enter mobile number"
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g,'')); setError(''); }}
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  padding: '0 14px', height: 50,
                  fontSize: 16, fontWeight: 500, color: '#0f172a',
                  background: 'transparent', fontFamily: 'inherit',
                  letterSpacing: '0.5px',
                }}
              />
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !phoneFilled}
              style={{
                width: '100%', height: 50, borderRadius: 12, border: 'none',
                background: phoneFilled ? '#E8740C' : '#94a3b8',
                color: '#fff', fontWeight: 700, fontSize: 16,
                cursor: phoneFilled ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                transition: 'background 0.2s',
                letterSpacing: '0.3px',
              }}
            >
              {loading ? 'Sending…' : 'Continue'}
            </button>

            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
              By continuing, you agree to our{' '}
              <a href="/terms" style={{ color: '#E8740C', textDecoration: 'underline' }}>Terms of service</a>
              {' & '}
              <a href="/privacy" style={{ color: '#E8740C', textDecoration: 'underline' }}>Privacy policy</a>
            </div>
          </form>
        )}

        {/* OTP step — 6 individual boxes */}
        {step === 'otp' && (
          <form onSubmit={verifyOtp}>
            <div style={{
              display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20,
            }} onPaste={handleOtpPaste}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={otpRefs[idx]}
                  type="tel" inputMode="numeric" maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(idx, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(idx, e)}
                  style={{
                    width: 44, height: 52,
                    border: `2px solid ${digit ? '#E8740C' : '#e2e8f0'}`,
                    borderRadius: 10,
                    fontSize: 22, fontWeight: 700,
                    textAlign: 'center', outline: 'none',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    background: digit ? '#fff3ec' : '#f8fafc',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                />
              ))}
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !otpFilled}
              style={{
                width: '100%', height: 50, borderRadius: 12, border: 'none',
                background: otpFilled ? '#E8740C' : '#94a3b8',
                color: '#fff', fontWeight: 700, fontSize: 16,
                cursor: otpFilled ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: 'background 0.2s',
              }}
            >
              {loading ? 'Verifying…' : 'Verify OTP'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              {timer > 0 ? (
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  Resend in <strong style={{ color: '#0f172a' }}>{timer}s</strong>
                </span>
              ) : (
                <button type="button" onClick={() => { setOtp(['','','','','','']); setError(''); sendOtp(); }}
                  style={{ border:'none', background:'none', color:'#E8740C', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                  Resend OTP
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      <style>{`
        @keyframes sf-slide-up {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Main Header ───────────────────────────────────────────────────────────────
export default function StorefrontHeader() {
  const { itemCount, subtotal }    = useCart();
  const { citySlug, cityName }     = useCity();
  const [query,     setQuery]      = useState('');
  const [user,      setUser]       = useState(null);
  const [menuOpen,  setMenuOpen]   = useState(false);
  const [modalOpen, setModalOpen]  = useState(false);
  const router  = useRouter();
  const menuRef = useRef(null);

  useEffect(() => {
    const token = Cookies.get('tn_token');
    if (!token) { setUser(null); return; }
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      setUser({ phone: payload.phone || payload.sub || 'Account' });
    } catch { setUser({ phone: 'Account' }); }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const fn = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [menuOpen]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}&city=${citySlug}`);
  };

  const handleLogout = () => {
    Cookies.remove('tn_token'); Cookies.remove('tn_refresh');
    setUser(null); setMenuOpen(false);
    router.push('/');
  };

  // Subtotal is in paise → convert to rupees
  const totalRs = Math.round(subtotal / 100);

  const accountLinks = [
    { href: '/profile', label: 'My Profile' },
    { href: '/orders',  label: 'My Orders'  },
    { href: '/wallet',  label: 'Wallet'     },
    { href: '/referral',label: 'Refer & Earn'},
  ];

  return (
    <>
      {modalOpen && (
        <OtpModal
          onClose={() => setModalOpen(false)}
          onSuccess={(u) => { setUser(u); setModalOpen(false); }}
        />
      )}

      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e8ecf0',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
      }}>
        {/* ── Main bar ── */}
        <div style={{
          maxWidth: 1280, margin: '0 auto',
          padding: '0 20px', height: 64,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>

          {/* Logo */}
          <Link href={`/?city=${citySlug}`} style={{
            fontSize: 20, fontWeight: 900,
            color: '#E8740C', textDecoration: 'none',
            letterSpacing: '-0.5px', flexShrink: 0,
          }}>
            Tezz<span style={{ color: '#0D3B6E' }}>Nirmaan</span>
          </Link>

          {/* City chip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', border: '1px solid #e2e8f0',
            borderRadius: 8, cursor: 'pointer', flexShrink: 0,
            background: '#f8fafc', minWidth: 110,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#E8740C">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1, fontWeight: 500 }}>Delivery to</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                {cityName || 'Select city'} ▾
              </div>
            </div>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} style={{ flex: 1, position: 'relative', maxWidth: 620 }}>
            <span style={{
              position: 'absolute', left: 14, top: '50%',
              transform: 'translateY(-50%)', color: '#94a3b8',
              pointerEvents: 'none', display: 'flex',
            }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </span>
            <input
              type="search"
              placeholder="Search cement, paint, tiles…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search products"
              style={{
                width: '100%', height: 42,
                border: '1.5px solid #e2e8f0', borderRadius: 10,
                padding: '0 16px 0 42px', fontSize: 14,
                fontFamily: 'inherit', outline: 'none',
                background: '#f8fafc', color: '#0f172a',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor='#E8740C'; e.target.style.boxShadow='0 0 0 3px rgba(232,116,12,0.1)'; }}
              onBlur={e  => { e.target.style.borderColor='#e2e8f0'; e.target.style.boxShadow='none'; }}
            />
          </form>

          {/* Right actions */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:'auto', flexShrink:0 }}>
            <WalletBadge />
            <NotificationBell />

            {/* Login / Account */}
            {user ? (
              <div style={{ position:'relative' }} ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  style={{
                    display:'flex', alignItems:'center', gap:7,
                    padding:'7px 14px', borderRadius:10,
                    border:'1.5px solid #e2e8f0', background:'#fff',
                    cursor:'pointer', fontFamily:'inherit',
                  }}
                >
                  <div style={{
                    width:28, height:28, borderRadius:'50%',
                    background:'#E8740C', color:'#fff',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontWeight:700, fontSize:12, flexShrink:0,
                  }}>{user.phone?.slice(-2) || 'Me'}</div>
                  <span style={{ fontSize:13, fontWeight:600, color:'#0f172a', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Account</span>
                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                {menuOpen && (
                  <div style={{
                    position:'absolute', top:'calc(100% + 8px)', right:0,
                    background:'#fff', borderRadius:12,
                    boxShadow:'0 8px 32px rgba(0,0,0,0.12)',
                    border:'1px solid #f1f5f9', minWidth:200, zIndex:200, overflow:'hidden',
                  }}>
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', background:'#f8fafc' }}>
                      <div style={{ fontSize:11, color:'#94a3b8', fontWeight:500 }}>Logged in as</div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{user.phone}</div>
                    </div>
                    {accountLinks.map(link => (
                      <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}
                        style={{ display:'block', padding:'10px 16px', fontSize:14, fontWeight:500, color:'#334155', textDecoration:'none' }}
                        onMouseOver={e=>e.currentTarget.style.background='#f8fafc'}
                        onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                        {link.label}
                      </Link>
                    ))}
                    <div style={{ height:1, background:'#f1f5f9', margin:'4px 0' }}/>
                    <button onClick={handleLogout}
                      style={{ display:'block', width:'100%', padding:'10px 16px', fontSize:14, fontWeight:600, color:'#ef4444', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}
                      onMouseOver={e=>e.currentTarget.style.background='#fef2f2'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setModalOpen(true)}
                style={{
                  padding:'9px 22px', borderRadius:10,
                  border:'1.5px solid #0D3B6E', background:'#fff',
                  color:'#0D3B6E', fontWeight:700, fontSize:14,
                  cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
                }}
                onMouseOver={e=>{ e.currentTarget.style.background='#0D3B6E'; e.currentTarget.style.color='#fff'; }}
                onMouseOut={e=>{  e.currentTarget.style.background='#fff';    e.currentTarget.style.color='#0D3B6E'; }}
              >
                Login
              </button>
            )}

            {/* ── Blinkit-style Cart button ── */}
            <Link
              href="/cart"
              aria-label={`Cart, ${itemCount} items`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: itemCount > 0 ? '8px 16px' : '9px 18px',
                borderRadius: 12,
                background: '#0a7c00',
                color: '#fff',
                fontWeight: 700,
                textDecoration: 'none',
                position: 'relative',
                transition: 'background 0.15s',
                minWidth: itemCount > 0 ? 120 : 'auto',
              }}
              onMouseOver={e => e.currentTarget.style.background = '#086600'}
              onMouseOut={e  => e.currentTarget.style.background = '#0a7c00'}
            >
              {/* Cart icon */}
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>

              {itemCount > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
                    ₹{totalRs.toLocaleString('en-IN')}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 14, fontWeight: 700 }}>Cart</span>
              )}
            </Link>
          </div>
        </div>

        {/* ── Delivery mode sub-bar ── */}
        <div style={{ borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>
          <div style={{
            maxWidth: 1280, margin: '0 auto', padding: '0 20px',
            height: 38, display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Link href={`/?city=${citySlug}&mode=quick`} style={{
              display:'flex', alignItems:'center', gap:5,
              padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600,
              textDecoration:'none', background:'#fff3ec', color:'#E8740C',
              border:'1px solid rgba(232,116,12,0.2)',
            }}>⚡ Quick · 60–90 min</Link>
            <Link href={`/?city=${citySlug}&mode=scheduled`} style={{
              display:'flex', alignItems:'center', gap:5,
              padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600,
              textDecoration:'none', color:'#64748b', border:'1px solid transparent',
            }}>📅 Scheduled · Same day</Link>
          </div>
        </div>
      </header>
    </>
  );
}
