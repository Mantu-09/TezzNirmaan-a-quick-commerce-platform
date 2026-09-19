// ─────────────────────────────────────────────────────────────
// (storefront)/search/SearchClient.jsx — P12-2
//
// Client island embedded inside the server search page.
// Responsibilities:
//   1. Instant search — debounced 250ms, shows live dropdown
//      of up to 6 results without a full page navigation.
//   2. Voice search — Web Speech API (Hindi + English).
//   3. "Search as you type" — after 500ms with no changes,
//      pushes new URL so the server result set updates.
//   4. Recent searches — stored in localStorage (max 8).
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const RECENT_KEY  = 'tn_recent_searches';
const DEBOUNCE_MS = 250;
const NAV_MS      = 600;  // Push URL after this many ms of no typing

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function saveRecent(term) {
  if (!term?.trim()) return;
  const list = [term, ...getRecent().filter(t => t !== term)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

export default function SearchClient({ initialQuery, citySlug, category, sort, inStock }) {
  const router           = useRouter();
  const [query,    setQuery]    = useState(initialQuery || '');
  const [dropdown, setDropdown] = useState([]); // instant results
  const [loading,  setLoading]  = useState(false);
  const [focused,  setFocused]  = useState(false);
  const [recent,   setRecent]   = useState([]);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const inputRef    = useRef(null);
  const dropRef     = useRef(null);
  const debounceRef = useRef(null);
  const navRef      = useRef(null);
  const recognitionRef = useRef(null);

  // ── Load recent searches ───────────────────────────────────
  useEffect(() => {
    setRecent(getRecent());
    setVoiceSupported('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }, []);

  // ── Sync if parent query changes (e.g. browser back) ──────
  useEffect(() => { setQuery(initialQuery || ''); }, [initialQuery]);

  // ── Close dropdown on outside click ───────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Instant search fetch ───────────────────────────────────
  const fetchInstant = useCallback(async (q) => {
    if (!q.trim() || q.length < 2) { setDropdown([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/backend/public/catalog?city=${encodeURIComponent(citySlug)}&q=${encodeURIComponent(q)}&limit=6&sort=popular`,
        { signal: AbortSignal.timeout(3000) }
      );
      const json = await res.json();
      setDropdown((json.data?.products || json.products || []).slice(0, 6));
    } catch {
      setDropdown([]);
    } finally {
      setLoading(false);
    }
  }, [citySlug]);

  // ── onChange handler: debounce instant + delayed nav ──────
  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setDropdown([]);

    // Instant dropdown
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchInstant(val), DEBOUNCE_MS);

    // URL push (search-as-you-type)
    clearTimeout(navRef.current);
    if (val.trim().length >= 2) {
      navRef.current = setTimeout(() => {
        const params = new URLSearchParams();
        params.set('q', val.trim());
        params.set('city', citySlug);
        if (category) params.set('category', category);
        if (sort && sort !== 'popular') params.set('sort', sort);
        if (inStock) params.set('in_stock', '1');
        router.push(`/search?${params.toString()}`, { scroll: false });
      }, NAV_MS);
    }
  };

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    saveRecent(query.trim());
    setRecent(getRecent());
    setFocused(false);
    const params = new URLSearchParams({ q: query.trim(), city: citySlug });
    if (category) params.set('category', category);
    if (sort && sort !== 'popular') params.set('sort', sort);
    router.push(`/search?${params.toString()}`);
  };

  const goTo = (term) => {
    saveRecent(term);
    setQuery(term);
    setFocused(false);
    setDropdown([]);
    router.push(`/search?q=${encodeURIComponent(term)}&city=${encodeURIComponent(citySlug)}`);
  };

  // ── Voice search ───────────────────────────────────────────
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (recognitionRef.current) { recognitionRef.current.stop(); }
    const rec = new SR();
    rec.lang           = 'hi-IN'; // Hindi first, falls back to English
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = () => setListening(false);
    rec.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript;
      setQuery(transcript);
      if (ev.results[0].isFinal) {
        saveRecent(transcript);
        setFocused(false);
        router.push(`/search?q=${encodeURIComponent(transcript)}&city=${encodeURIComponent(citySlug)}`);
      } else {
        // Interim — show in box
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchInstant(transcript), DEBOUNCE_MS);
      }
    };
    recognitionRef.current = rec;
    rec.start();
  };

  const showDropdown = focused && (dropdown.length > 0 || (query.length < 2 && recent.length > 0) || loading);

  // ── Styles ─────────────────────────────────────────────────
  const wrapStyle = {
    position: 'relative',
    marginBottom: 20,
  };
  const formStyle = {
    display:     'flex',
    alignItems:  'center',
    gap:         8,
    background:  'var(--sf-surface,#fff)',
    border:      `2px solid ${focused ? 'var(--sf-primary,#f97316)' : 'var(--sf-border,#e5e7eb)'}`,
    borderRadius: 14,
    padding:     '0 12px',
    boxShadow:   focused ? '0 0 0 3px rgba(249,115,22,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
    transition:  'border-color 0.15s, box-shadow 0.15s',
  };
  const inputStyle = {
    flex:       1,
    border:     'none',
    outline:    'none',
    background: 'transparent',
    fontSize:   16,
    fontFamily: 'var(--sf-font,system-ui)',
    color:      'var(--sf-text,#111827)',
    padding:    '14px 4px',
  };
  const dropStyle = {
    position:   'absolute',
    top:        'calc(100% + 6px)',
    left:       0, right: 0,
    background: 'var(--sf-surface,#fff)',
    border:     '1px solid var(--sf-border,#e5e7eb)',
    borderRadius: 14,
    boxShadow:  '0 8px 24px rgba(0,0,0,0.12)',
    zIndex:     300,
    overflow:   'hidden',
  };

  return (
    <div style={wrapStyle}>
      <form onSubmit={handleSubmit} style={formStyle} role="search">
        {/* Search icon */}
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="var(--sf-text-3,#9ca3af)" strokeWidth="2" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>

        <input
          ref={inputRef}
          type="search"
          style={inputStyle}
          placeholder="Search cement, paint, steel, tiles…"
          value={query}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          autoComplete="off"
          aria-label="Search products"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />

        {/* Loading spinner */}
        {loading && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="#e5e7eb" strokeWidth="3"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--sf-primary,#f97316)" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        )}

        {/* Clear */}
        {query && (
          <button type="button" onClick={() => { setQuery(''); setDropdown([]); inputRef.current?.focus(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sf-text-3,#9ca3af)', padding: 2, flexShrink: 0, lineHeight: 1 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}

        {/* Voice search */}
        {voiceSupported && (
          <button type="button" onClick={startVoice} title="Search by voice"
            style={{
              background: listening ? '#fee2e2' : 'none', border: 'none', cursor: 'pointer',
              color: listening ? '#dc2626' : 'var(--sf-text-3,#9ca3af)', padding: '4px', flexShrink: 0,
              borderRadius: 8, transition: 'background 0.15s',
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={listening ? '#dc2626' : 'currentColor'}>
              <path d="M12 1a3 3 0 0 1 3 3v8a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="8"  y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        )}

        <button type="submit"
          style={{
            padding: '8px 18px', borderRadius: 10, background: 'var(--sf-primary,#f97316)',
            color: '#fff', border: 'none', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', flexShrink: 0,
          }}>
          Search
        </button>
      </form>

      {/* ── Dropdown ─────────────────────────────────────────── */}
      {showDropdown && (
        <div ref={dropRef} style={dropStyle} role="listbox">
          {/* Recent searches (when query is empty) */}
          {query.length < 2 && recent.length > 0 && (
            <div>
              <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--sf-text-3,#9ca3af)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Recent Searches
              </div>
              {recent.slice(0, 5).map(term => (
                <button key={term} onClick={() => goTo(term)} role="option"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 14, color: 'var(--sf-text,#111827)', fontFamily: 'var(--sf-font,system-ui)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sf-text-3,#9ca3af)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {term}
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--sf-border,#f3f4f6)', margin: '4px 0' }} />
            </div>
          )}

          {/* Live product results */}
          {dropdown.map((item, i) => {
            const price = item.discounted_price || item.price;
            return (
              <button key={item.inventory_id || i} onClick={() => goTo(item.name)} role="option"
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: i < dropdown.length - 1 ? '1px solid var(--sf-border,#f9fafb)' : 'none', fontFamily: 'var(--sf-font,system-ui)' }}>
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--sf-border,#e5e7eb)', flexShrink: 0 }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📦</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sf-text,#111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--sf-text-3,#9ca3af)' }}>{item.brand || item.category}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sf-primary,#f97316)', whiteSpace: 'nowrap' }}>
                  ₹{Math.round((price || 0) / 100).toLocaleString('en-IN')}
                </div>
              </button>
            );
          })}

          {/* Listening indicator */}
          {listening && (
            <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block', animation: 'sfPulse 1s ease-in-out infinite' }} />
              Listening… speak now
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes sfPulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
    </div>
  );
}
