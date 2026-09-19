'use client';
// ─────────────────────────────────────────────────────────────────────────────
// MarketingNav.jsx — Blinkit-style navbar (exact match)
//
// Layout: Logo | Location (delivery time + city ▼) | Search | Login | Cart
// Cart:  empty → white/gray pill  |  has items → green pill
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import Cookies from 'js-cookie';

const API      = process.env.NEXT_PUBLIC_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:3000';
const CART_KEY = 'tn_web_cart';

// ── OTP Modal ─────────────────────────────────────────────────────────────────
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

  function handleOtpChange(idx, val) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp]; next[idx] = digit; setOtp(next); setError('');
    if (digit && idx < 5) otpRefs[idx + 1].current?.focus();
  }
  function handleOtpKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs[idx - 1].current?.focus();
  }
  function handleOtpPaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) { setOtp(text.split('')); otpRefs[5].current?.focus(); }
    e.preventDefault();
  }

  async function sendOtp(e) {
    e?.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) { setError('Enter a valid 10-digit mobile number'); return; }
    setError(''); setLoading(true);
    try {
      const res  = await fetch(`${API}/api/v1/auth/otp/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${digits}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to send OTP');
      setStep('otp'); setTimer(30);
    } catch (err) { setError(err.message || 'Something went wrong'); }
    finally { setLoading(false); }
  }

  async function verifyOtp(e) {
    e?.preventDefault();
    const digits = phone.replace(/\D/g, '');
    const otpStr = otp.join('');
    if (otpStr.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    setError(''); setLoading(true);
    try {
      const res  = await fetch(`${API}/api/v1/auth/otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${digits}`, otp: otpStr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Invalid OTP');
      const { session } = data.data;
      Cookies.set('tn_token',   session.accessToken,  { expires: 7,  sameSite: 'lax' });
      Cookies.set('tn_refresh', session.refreshToken, { expires: 30, sameSite: 'lax' });
      onSuccess({ phone: `+91${digits}` });
    } catch (err) { setError(err.message || 'Something went wrong'); }
    finally { setLoading(false); }
  }

  const phoneFilled = phone.replace(/\D/g, '').length === 10;
  const otpFilled   = otp.join('').length === 6;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 24, width: '100%', maxWidth: 380,
        padding: '36px 28px 28px', position: 'relative',
        boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
        animation: 'mn-up .22s cubic-bezier(.34,1.56,.64,1)',
        textAlign: 'center',
      }}>
        {step === 'otp' && (
          <button onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError(''); }}
            style={{ position:'absolute', top:16, left:16, width:32, height:32, border:'none', background:'none', cursor:'pointer', fontSize:20, color:'#334155' }}>←</button>
        )}
        <button onClick={onClose}
          style={{ position:'absolute', top:16, right:16, width:32, height:32, border:'none', background:'#f1f5f9', borderRadius:'50%', cursor:'pointer', fontSize:18, color:'#64748b' }}>×</button>

        <div style={{ width:64, height:64, borderRadius:16, background:'linear-gradient(135deg,#E8740C,#c96200)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(232,116,12,.35)' }}>
          <span style={{ fontSize:28, fontWeight:900, color:'#fff' }}>T</span>
        </div>
        <div style={{ fontSize:20, fontWeight:800, color:'#0f172a', marginBottom:4 }}>
          {step === 'phone' ? "India's quick commerce app" : 'Enter OTP'}
        </div>
        <div style={{ fontSize:13, color:'#64748b', marginBottom:26 }}>
          {step === 'phone' ? 'Log in or Sign up' : `Sent to +91 ${phone.replace(/\D/g,'')}`}
        </div>

        {step === 'phone' && (
          <form onSubmit={sendOtp} style={{ textAlign:'left' }}>
            <div style={{ display:'flex', alignItems:'center', border:'1.5px solid #e2e8f0', borderRadius:12, overflow:'hidden', marginBottom:14, background:'#f8fafc' }}
              onFocusCapture={e => e.currentTarget.style.borderColor='#E8740C'}
              onBlurCapture={e  => e.currentTarget.style.borderColor='#e2e8f0'}>
              <div style={{ padding:'0 14px', height:50, display:'flex', alignItems:'center', fontWeight:700, fontSize:15, color:'#334155', borderRight:'1.5px solid #e2e8f0', flexShrink:0, background:'#fff' }}>+91</div>
              <input ref={phoneRef} type="tel" inputMode="numeric" maxLength={10} placeholder="Enter mobile number" value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g,'')); setError(''); }}
                style={{ flex:1, border:'none', outline:'none', padding:'0 14px', height:50, fontSize:16, fontWeight:500, color:'#0f172a', background:'transparent', fontFamily:'inherit' }}/>
            </div>
            {error && <div style={{ color:'#ef4444', fontSize:13, marginBottom:10, textAlign:'center' }}>{error}</div>}
            <button type="submit" disabled={loading || !phoneFilled}
              style={{ width:'100%', height:50, borderRadius:12, border:'none', background: phoneFilled ? '#E8740C' : '#94a3b8', color:'#fff', fontWeight:700, fontSize:16, cursor: phoneFilled ? 'pointer' : 'not-allowed', fontFamily:'inherit', transition:'background .2s' }}>
              {loading ? 'Sending…' : 'Continue'}
            </button>
            <div style={{ fontSize:11, color:'#94a3b8', textAlign:'center', marginTop:14, lineHeight:1.6 }}>
              By continuing you agree to our{' '}
              <a href="/terms" style={{ color:'#E8740C' }}>Terms</a> &amp;{' '}
              <a href="/privacy" style={{ color:'#E8740C' }}>Privacy Policy</a>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={verifyOtp}>
            <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:20 }} onPaste={handleOtpPaste}>
              {otp.map((digit, idx) => (
                <input key={idx} ref={otpRefs[idx]} type="tel" inputMode="numeric" maxLength={1} value={digit}
                  onChange={e => handleOtpChange(idx, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(idx, e)}
                  style={{ width:44, height:52, border:`2px solid ${digit ? '#E8740C' : '#e2e8f0'}`, borderRadius:10, fontSize:22, fontWeight:700, textAlign:'center', outline:'none', color:'#0f172a', background: digit ? '#fff3ec' : '#f8fafc', fontFamily:'monospace', transition:'border-color .15s' }}/>
              ))}
            </div>
            {error && <div style={{ color:'#ef4444', fontSize:13, marginBottom:10 }}>{error}</div>}
            <button type="submit" disabled={loading || !otpFilled}
              style={{ width:'100%', height:50, borderRadius:12, border:'none', background: otpFilled ? '#E8740C' : '#94a3b8', color:'#fff', fontWeight:700, fontSize:16, cursor: otpFilled ? 'pointer' : 'not-allowed', fontFamily:'inherit', transition:'background .2s' }}>
              {loading ? 'Verifying…' : 'Verify OTP'}
            </button>
            <div style={{ textAlign:'center', marginTop:14 }}>
              {timer > 0
                ? <span style={{ fontSize:13, color:'#94a3b8' }}>Resend in <b style={{ color:'#0f172a' }}>{timer}s</b></span>
                : <button type="button" onClick={() => { setOtp(['','','','','','']); setError(''); sendOtp(); }}
                    style={{ border:'none', background:'none', color:'#E8740C', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Resend OTP</button>
              }
            </div>
          </form>
        )}
      </div>
      <style>{`@keyframes mn-up{from{opacity:0;transform:scale(.92) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  );
}

// ── Telescope SVG illustration (for Oops state) ───────────────────────────────
function TelescopeIllustration() {
  return (
    <svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 160, height: 144 }}>
      {/* Ground */}
      <ellipse cx="100" cy="168" rx="60" ry="6" fill="#e8f5e9" />
      {/* Big green leaf left */}
      <ellipse cx="46" cy="148" rx="22" ry="30" fill="#4caf50" transform="rotate(-20 46 148)" />
      <ellipse cx="38" cy="142" rx="14" ry="22" fill="#388e3c" transform="rotate(-30 38 142)" />
      {/* Small leaf right */}
      <ellipse cx="162" cy="152" rx="14" ry="20" fill="#66bb6a" transform="rotate(15 162 152)" />
      {/* Body */}
      <rect x="88" y="110" width="22" height="42" rx="6" fill="#212121" />
      {/* Shoes */}
      <ellipse cx="93" cy="156" rx="10" ry="5" fill="#00BCD4" />
      <ellipse cx="109" cy="156" rx="10" ry="5" fill="#00BCD4" />
      {/* Pants */}
      <rect x="86" y="118" width="28" height="28" rx="4" fill="#212121" />
      {/* Shirt */}
      <rect x="84" y="88" width="32" height="34" rx="8" fill="#FDD835" />
      {/* Arm extended holding telescope */}
      <rect x="116" y="86" width="30" height="10" rx="5" fill="#FDD835" transform="rotate(-18 116 86)" />
      {/* Head */}
      <circle cx="100" cy="76" r="18" fill="#FFCCBC" />
      {/* Hair */}
      <path d="M82 72 Q84 55 100 56 Q116 55 118 72" fill="#212121" />
      {/* Eye */}
      <circle cx="107" cy="74" r="2.5" fill="#212121" />
      {/* Telescope body */}
      <rect x="128" y="74" width="40" height="12" rx="6" fill="#9E9E9E" transform="rotate(-18 128 74)" />
      <rect x="156" y="67" width="18" height="16" rx="4" fill="#757575" transform="rotate(-18 156 67)" />
      {/* Telescope lens gleam */}
      <circle cx="166" cy="64" r="3" fill="#E0E0E0" opacity="0.7" />
      {/* Clouds */}
      <ellipse cx="50" cy="40" rx="22" ry="11" fill="#e0e0e0" opacity="0.7" />
      <ellipse cx="64" cy="36" rx="16" ry="10" fill="#eeeeee" opacity="0.7" />
      <ellipse cx="38" cy="38" rx="13" ry="8" fill="#e0e0e0" opacity="0.6" />
    </svg>
  );
}

// ── Location Modal (full-screen overlay — Blinkit style) ──────────────────────
function LocationDropdown({ onClose, onCityChange }) {
  const [query,       setQuery]       = useState('');
  const [locating,    setLocating]    = useState(false);
  const [permError,   setPermError]   = useState('');   // browser permission / GPS error
  const [suggestions, setSuggestions] = useState([]);
  const [allCities,   setAllCities]   = useState(null); // cache of all active cities from API
  const [oopsCity,    setOopsCity]    = useState('');   // city name that is not serviceable
  const [loadingCities, setLoadingCities] = useState(false);
  const inputRef    = useRef(null);
  const timerRef    = useRef(null);
  const loadingRef  = useRef(false); // prevent double-fetch in StrictMode

  // Pre-load all cities once on mount for fast matching
  useEffect(() => {
    // Focus input after paint (avoids setState-during-render warning)
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    loadCities();
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCities() {
    if (loadingRef.current) return; // prevent StrictMode double-call
    loadingRef.current = true;
    setLoadingCities(true);
    try {
      const BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:3000';
      const res  = await fetch(`${BASE}/api/v1/public/cities`);
      if (!res.ok) throw new Error('Cities fetch failed');
      const json = await res.json();
      // Safely extract array regardless of response shape:
      // { data: [...] }  or  { data: { cities: [...] } }  or  { cities: [...] }
      let list = json?.data ?? json?.cities ?? json ?? [];
      if (!Array.isArray(list)) {
        list = list?.cities ?? list?.data ?? Object.values(list);
      }
      if (!Array.isArray(list)) list = [];
      setAllCities(list);
    } catch {
      setAllCities([]); // graceful fallback — never leave as non-array
    } finally {
      setLoadingCities(false);
      loadingRef.current = false;
    }
  }

  // Check if a city name is serviceable (Strict match only)
  function isServiceable(cityName) {
    if (!cityName || !Array.isArray(allCities) || allCities.length === 0) return false;
    const target = cityName.toLowerCase().trim();
    
    const match = allCities.find(c => {
      if (!c?.name) return false;
      return c.name.toLowerCase().trim() === target;
    });
    
    return match ? match.is_active !== false : false;
  }

  // Reverse-geocode lat/lng → city name via Mapbox
  async function reversegeocode(lat, lng) {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) {
        console.warn('Missing NEXT_PUBLIC_MAPBOX_TOKEN in .env file');
        return 'Your Location';
      }
      // Mapbox v5 Geocoding API (expects longitude first, then latitude)
      // types=place,locality filters the response specifically to city/town names
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality&access_token=${token}`
      );
      if (!res.ok) return 'Your Location';
      const data = await res.json();
      
      if (data.features && data.features.length > 0) {
        return data.features[0].text; // The city name
      }
      return 'Your Location';
    } catch (err) {
      console.error('Mapbox geocoding error:', err);
      return 'Your Location';
    }
  }

  function detect() {
    setPermError(''); setOopsCity('');
    if (!navigator.geolocation) {
      setPermError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const city = await reversegeocode(pos.coords.latitude, pos.coords.longitude);
          if (!isServiceable(city)) {
            setOopsCity(city);
            setQuery(city);
          } else {
            Cookies.set('tn_city', city.toLowerCase(), { expires: 30, sameSite: 'lax' });
            onCityChange(city);
            onClose();
          }
        } catch {
          setPermError('Could not determine your city. Please search manually.');
        } finally { setLocating(false); }
      },
      (err) => {
        setLocating(false);
        if (err.code === 1)      setPermError('Location permission denied. Please enable it in browser settings.');
        else if (err.code === 2) setPermError('Location unavailable. Check your GPS or network.');
        else                     setPermError('Request timed out. Please search your city manually.');
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  }

  function handleQueryChange(e) {
    const val = e.target.value;
    setQuery(val); setOopsCity(''); setPermError('');
    clearTimeout(timerRef.current);
    if (!val.trim()) { setSuggestions([]); return; }
    
    timerRef.current = setTimeout(async () => {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (token && val.trim().length >= 2) {
        try {
          const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(val)}.json?country=in&types=poi,address,place,locality,neighborhood&access_token=${token}`);
          if (res.ok) {
            const data = await res.json();
            const list = data.features.map(f => {
              const main = f.text;
              // Clean up the subtext by removing the main text from the start if it's there
              const sub = f.place_name.replace(f.text + ', ', '').replace(f.text + ',', '').trim();
              
              // Extract the actual city to check if it's in our service area
              let cityName = main;
              const placeCtx = (f.context || []).find(c => c.id.startsWith('place') || c.id.startsWith('locality'));
              if (placeCtx) cityName = placeCtx.text;
              else if (f.id.startsWith('place') || f.id.startsWith('locality')) cityName = f.text;
              
              return { id: f.id, main, sub, cityName, is_active: isServiceable(cityName) };
            });
            setSuggestions(list);
            if (list.length === 0 && val.trim().length >= 3) {
              setOopsCity(val.trim());
            }
            return;
          }
        } catch(err) { console.error(err); }
      }

      // Fallback to local allCities if mapbox fails or token missing
      const cities = Array.isArray(allCities) ? allCities : [];
      const filtered = cities
        .filter(c => c?.name && c.name.toLowerCase().includes(val.toLowerCase()))
        .map(c => ({ id: c.id, main: c.name, sub: `${c.name}, ${c.state || 'India'}`, cityName: c.name, is_active: c.is_active !== false }));
      
      setSuggestions(filtered.slice(0, 6));
      if (filtered.length === 0 && val.trim().length >= 3) {
        setOopsCity(val.trim());
      }
    }, 300);
  }

  function selectCity(item) {
    setOopsCity(''); setPermError('');
    if (!item.is_active) {
      setOopsCity(item.cityName);
      setQuery(item.main);
      setSuggestions([]);
      return;
    }
    Cookies.set('tn_city', item.main.toLowerCase(), { expires: 30, sameSite: 'lax' });
    onCityChange(item.main);
    onClose();
  }

  const showOops    = !!oopsCity;
  const showSuggest = !showOops && suggestions.length > 0;

  return (
    /* Full-screen overlay */
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(30,30,30,0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      {/* Card */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        width: '100%',
        maxWidth: 520,
        boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
        overflow: 'hidden',
        animation: 'loc-modal-up .22s cubic-bezier(.34,1.56,.64,1)',
        position: 'relative',
      }}>

        {/* Top section — Light Gray Background */}
        <div style={{ padding: '24px 24px 24px', background: '#f5f7fa' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: '#1c1c1c' }}>
              Change Location
            </span>
            <button
              onClick={onClose}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                color: '#555', fontSize: 20, lineHeight: 1, padding: 4,
                transition: 'color .15s',
              }}
              onMouseOver={e => e.currentTarget.style.color = '#000'}
              onMouseOut={e  => e.currentTarget.style.color = '#555'}
            >
              ×
            </button>
          </div>

          {/* Detect + OR + Search row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {/* Detect button */}
            <button
              onClick={detect}
              disabled={locating}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 16px', height: 42,
                borderRadius: 4, border: 'none',
                background: '#0a7c00', color: '#fff',
                fontWeight: 500, fontSize: 14,
                cursor: locating ? 'default' : 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
                transition: 'background .15s',
              }}
              onMouseOver={e => { if (!locating) e.currentTarget.style.background = '#096b00'; }}
              onMouseOut={e  => { e.currentTarget.style.background = '#0a7c00'; }}
            >
              {locating ? 'Locating…' : 'Detect my location'}
            </button>

            {/* ─── OR ─── divider with circle and lines */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '0 10px', flexShrink: 0 }}>
              <div style={{ width: 12, height: 1, background: '#e0e0e0' }} />
              <div style={{ 
                width: 30, height: 30, borderRadius: '50%', background: '#fff',
                border: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#999', fontWeight: 500
              }}>
                OR
              </div>
              <div style={{ width: 12, height: 1, background: '#e0e0e0' }} />
            </div>

            {/* Search input */}
            <input
              ref={inputRef}
              type="text"
              placeholder="Search delivery location"
              value={query}
              onChange={handleQueryChange}
              style={{
                flex: 1, minWidth: 0, height: 42,
                border: '1px solid #e0e0e0', borderRadius: 8,
                padding: '0 16px', fontSize: 14, outline: 'none',
                fontFamily: 'inherit', color: '#1a1a1a', background: '#fff',
                transition: 'border-color .15s',
              }}
              onFocus={e => e.target.style.borderColor = '#E8740C'}
              onBlur={e  => e.target.style.borderColor = '#e0e0e0'}
            />
          </div>

          {permError && (
            <div style={{ marginTop: 12, color: '#d32f2f', fontSize: 13 }}>⚠️ {permError}</div>
          )}
        </div>

        {/* ── Suggestions list ─────────────────────────────────────────────── */}
        {showSuggest && (
          <div style={{ background: '#fff' }}>
            {loadingCities && (
              <div style={{ padding: '14px 24px', fontSize: 13, color: '#9e9e9e' }}>Searching…</div>
            )}
            {suggestions.map(item => (
              <button
                key={item.id}
                onClick={() => selectCity(item)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 16,
                  width: '100%', padding: '18px 24px',
                  background: '#fff', border: 'none',
                  borderBottom: '1px solid #f0f0f0',
                  textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
                  transition: 'background .1s',
                }}
                onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseOut={e  => e.currentTarget.style.background = '#fff'}
              >
                {/* Outlined Pin Icon (from reference image) */}
                <div style={{ marginTop: 2, flexShrink: 0 }}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#555" strokeWidth="1.8">
                    <path d="M12 21c-5-4.5-8-9-8-12a8 8 0 1116 0c0 3-3 7.5-8 12z" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="9" r="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>
                    {item.main}
                  </div>
                  <div style={{ fontSize: 13, color: '#666' }}>
                    {item.sub}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}



        {/* ── Oops — not serviceable state (Blinkit style) ─────────────────── */}
        {showOops && (
          <div style={{
            borderTop: '1.5px solid #f5f5f5',
            padding: '28px 32px 32px',
            textAlign: 'center',
            background: '#fafafa',
          }}>
            {/* Telescope illustration */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <TelescopeIllustration />
            </div>

            {/* Oops! */}
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 10 }}>
              Oops!
            </div>

            {/* Message */}
            <div style={{ fontSize: 14, color: '#555', lineHeight: 1.65, maxWidth: 300, margin: '0 auto 20px' }}>
              TezzNirmaan is not available at this location at the moment. Please select a different location.
            </div>

            {/* Try another location CTA */}
            <button
              onClick={() => { setOopsCity(''); setQuery(''); setSuggestions([]); inputRef.current?.focus(); }}
              style={{
                padding: '11px 28px',
                borderRadius: 50,
                border: '1.5px solid #0a7c00',
                background: 'transparent',
                color: '#0a7c00',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background .15s, color .15s',
              }}
              onMouseOver={e => { e.currentTarget.style.background = '#0a7c00'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#0a7c00'; }}
            >
              Try another location
            </button>
          </div>
        )}

        {/* ── Empty state — no query, no oops ──────────────────────────────── */}
        {!showOops && !showSuggest && !permError && (
          <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #f5f5f5' }}>
            <div style={{ fontSize: 12, color: '#bdbdbd', fontWeight: 500, marginBottom: 10 }}>
              AVAILABLE CITIES
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(Array.isArray(allCities) ? allCities : []).filter(c => c?.is_active !== false).slice(0, 8).map(c => (
                <button
                  key={c.id}
                  onClick={() => selectCity({ ...c, main: c.name, cityName: c.name, is_active: c.is_active !== false })}
                  style={{
                    padding: '6px 14px', borderRadius: 50,
                    border: '1.5px solid #e8e8e8',
                    background: '#fff', color: '#333',
                    fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color .12s, background .12s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = '#0a7c00'; e.currentTarget.style.background = '#f0faf0'; }}
                  onMouseOut={e  => { e.currentTarget.style.borderColor = '#e8e8e8'; e.currentTarget.style.background = '#fff'; }}
                >
                  {c.name}
                </button>
              ))}
              {loadingCities && (
                <span style={{ fontSize: 12, color: '#bdbdbd', padding: '6px 0' }}>Loading…</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes loc-modal-up {
          from { opacity: 0; transform: scale(0.93) translateY(16px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);     }
        }
        @keyframes loc-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Main Navbar ───────────────────────────────────────────────────────────────
export default function MarketingNav() {
  const [user,      setUser]      = useState(null);
  const [modal,     setModal]     = useState(false);
  const [locOpen,   setLocOpen]   = useState(false);
  const [acctOpen,  setAcctOpen]  = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [city,      setCity]      = useState('Patna');
  const [query,     setQuery]     = useState('');
  const locRef  = useRef(null);
  const acctRef = useRef(null);

  // ── Read cart ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function read() {
      try {
        const items = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        setCartCount(items.reduce((s, i) => s + (i.quantity || 0), 0));
        setCartTotal(items.reduce((s, i) => s + ((i.discounted_price || i.price || 0) * (i.quantity || 0)), 0));
      } catch { /**/ }
    }
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  // ── City from cookie ───────────────────────────────────────────────────────
  useEffect(() => {
    const c = Cookies.get('tn_city') || 'Patna';
    setCity(c.charAt(0).toUpperCase() + c.slice(1));
  }, []);

  // ── Auth from cookie ───────────────────────────────────────────────────────
  useEffect(() => {
    const token = Cookies.get('tn_token');
    if (!token) return;
    try {
      const p = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      setUser({ phone: p.phone || p.sub || 'Account' });
    } catch { /**/ }
  }, []);

  // ── Outside-click close ────────────────────────────────────────────────────
  useEffect(() => {
    if (!locOpen) return;
    const fn = e => { if (locRef.current && !locRef.current.contains(e.target)) setLocOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [locOpen]);
  useEffect(() => {
    if (!acctOpen) return;
    const fn = e => { if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [acctOpen]);

  function handleSearch(e) {
    e.preventDefault();
    if (query.trim()) window.location.href = `/search?q=${encodeURIComponent(query.trim())}`;
  }
  function handleLogout() {
    Cookies.remove('tn_token'); Cookies.remove('tn_refresh');
    setUser(null); setAcctOpen(false);
  }

  const totalRs   = Math.round(cartTotal / 100);
  const cartFull  = cartCount > 0;

  return (
    <>
      {modal && <OtpModal onClose={() => setModal(false)} onSuccess={u => { setUser(u); setModal(false); }} />}
      {locOpen && <LocationDropdown onClose={() => setLocOpen(false)} onCityChange={(c) => setCity(c)} />}

      {/* ── Nav shell ── */}
      <nav style={{
        background: '#fff',
        borderBottom: '1px solid #e8ecf0',
        position: 'sticky', top: 0, zIndex: 200,
        boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
      }}>
        <div style={{
          maxWidth: 1400, margin: '0 auto',
          padding: '0 24px', height: 72,
          display: 'flex', alignItems: 'center', gap: 18,
        }}>

          {/* ── Logo ── */}
          <a href="/" style={{ textDecoration:'none', flexShrink:0, display:'flex', alignItems:'center', gap:1 }}>
            <span style={{ fontSize:26, fontWeight:900, color:'#E8740C', letterSpacing:'-1px', lineHeight:1 }}>Tezz</span>
            <span style={{ fontSize:26, fontWeight:900, color:'#0D3B6E', letterSpacing:'-1px', lineHeight:1 }}>Nirmaan</span>
          </a>

          {/* ── Location ── */}
          <div style={{ position:'relative', flexShrink:0 }} ref={locRef}>
            <button
              onClick={() => setLocOpen(v => !v)}
              style={{ border:'none', background:'none', cursor:'pointer', padding:'4px 8px', borderRadius:8, textAlign:'left', fontFamily:'inherit' }}
            >
              <div style={{ fontSize:15, fontWeight:800, color:'#0f172a', lineHeight:1.25, whiteSpace:'nowrap' }}>
                Delivery in&nbsp;60&nbsp;min
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:12, color:'#64748b', fontWeight:500 }}>{city}, Bihar</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="#94a3b8">
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
            </button>
          </div>

          {/* Divider */}
          <div style={{ width:1, height:36, background:'#e8ecf0', flexShrink:0 }}/>

          {/* ── Search ── */}
          <form onSubmit={handleSearch} style={{ flex:1, position:'relative', minWidth:0 }}>
            <span style={{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', display:'flex', pointerEvents:'none' }}>
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </span>
            <input
              type="search"
              placeholder='Search "cement, paint, tiles…"'
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width:'100%', height:46,
                border:'1.5px solid #e8ecf0',
                borderRadius:12,
                padding:'0 16px 0 46px',
                fontSize:15, fontFamily:'inherit',
                outline:'none', background:'#f8fafc',
                color:'#0f172a', boxSizing:'border-box',
                transition:'border-color .15s, box-shadow .15s',
              }}
              onFocus={e => { e.target.style.borderColor='#E8740C'; e.target.style.boxShadow='0 0 0 3px rgba(232,116,12,.1)'; }}
              onBlur={e  => { e.target.style.borderColor='#e8ecf0'; e.target.style.boxShadow='none'; }}
            />
          </form>

          {/* ── Login / Account ── */}
          {user ? (
            <div style={{ position:'relative', flexShrink:0 }} ref={acctRef}>
              <button onClick={() => setAcctOpen(v => !v)}
                style={{ display:'flex', alignItems:'center', gap:8, border:'none', background:'none', cursor:'pointer', padding:'6px 10px', borderRadius:10, fontFamily:'inherit' }}>
                <div style={{ width:30, height:30, borderRadius:'50%', background:'#E8740C', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>
                  {user.phone?.slice(-2) || 'Me'}
                </div>
                <span style={{ fontSize:15, fontWeight:600, color:'#0f172a' }}>Account</span>
              </button>
              {acctOpen && (
                <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, background:'#fff', borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,.12)', border:'1px solid #f1f5f9', minWidth:195, zIndex:300, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', background:'#f8fafc' }}>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>Logged in as</div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{user.phone}</div>
                  </div>
                  {[{href:'/orders',label:'My Orders'},{href:'/profile',label:'My Profile'},{href:'/wallet',label:'Wallet'},{href:'/referral',label:'Refer & Earn'}].map(l=>(
                    <a key={l.href} href={l.href} style={{ display:'block', padding:'10px 16px', fontSize:14, fontWeight:500, color:'#334155', textDecoration:'none' }}
                      onMouseOver={e=>e.currentTarget.style.background='#f8fafc'}
                      onMouseOut={e =>e.currentTarget.style.background='transparent'}>{l.label}</a>
                  ))}
                  <div style={{ height:1, background:'#f1f5f9' }}/>
                  <button onClick={handleLogout}
                    style={{ display:'block', width:'100%', padding:'10px 16px', fontSize:14, fontWeight:600, color:'#ef4444', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}>Sign Out</button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => setModal(true)}
              style={{ border:'none', background:'none', cursor:'pointer', fontSize:16, fontWeight:700, color:'#0f172a', padding:'8px 14px', borderRadius:10, fontFamily:'inherit', flexShrink:0, whiteSpace:'nowrap', transition:'background .1s' }}
              onMouseOver={e => e.currentTarget.style.background='#f8fafc'}
              onMouseOut={e  => e.currentTarget.style.background='transparent'}>
              Login
            </button>
          )}

          {/* ── Cart ── gray when empty → green with icon+count+price when filled ── */}
          <a
            href="/cart"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 18px',
              borderRadius: 12,
              background: cartFull ? '#0a7c00' : '#f1f5f9',
              color: cartFull ? '#fff' : '#64748b',
              textDecoration: 'none',
              flexShrink: 0,
              border: cartFull ? 'none' : '1.5px solid #e2e8f0',
              transition: 'background .2s, color .2s',
              minWidth: cartFull ? 120 : 110,
              justifyContent: 'center',
            }}
            onMouseOver={e => { e.currentTarget.style.background = cartFull ? '#086600' : '#e8ecf0'; }}
            onMouseOut={e  => { e.currentTarget.style.background = cartFull ? '#0a7c00' : '#f1f5f9'; }}
          >
            {/* Cart icon — same on both states */}
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink:0 }}>
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>

            {cartFull ? (
              /* Filled: stacked "1 item" + "₹20" */
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.25, textAlign:'left' }}>
                <span style={{ fontSize:12, fontWeight:600, opacity:0.92, letterSpacing:'0.1px' }}>
                  {cartCount} {cartCount === 1 ? 'item' : 'items'}
                </span>
                <span style={{ fontSize:16, fontWeight:800, letterSpacing:'-0.3px' }}>
                  ₹{totalRs.toLocaleString('en-IN')}
                </span>
              </div>
            ) : (
              /* Empty: just "My Cart" */
              <span style={{ fontSize:15, fontWeight:700, letterSpacing:'-0.2px' }}>My Cart</span>
            )}
          </a>

        </div>
      </nav>
    </>
  );
}
