// ─────────────────────────────────────────────────────────────
// (storefront)/components/HeroBanner.jsx — P12-3
//
// Auto-advancing banner carousel. Client component.
// Props:
//   banners: [{ id, title, subtitle, image_url, link_url, cta_text, bg_color }]
//   autoPlayMs: interval (default 5000)
//
// Features:
//   • Auto-advances every 5s, pauses on hover
//   • Dot indicators + prev/next arrows
//   • Touch/swipe support on mobile
//   • Gradient fallback when no image_url
//   • Prefers motion-safe animation
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

const DEFAULT_BANNERS = [
  {
    id:        'default-1',
    title:     '⚡ 60-Minute Delivery',
    subtitle:  'Get cement, paint & hardware at your site fast',
    link_url:  '/category/construction',
    cta_text:  'Order Now',
    bg_color:  '#f97316',
    image_url: null,
  },
  {
    id:        'default-2',
    title:     '🎨 Paint Your Dream',
    subtitle:  'Top brands: Asian Paints, Berger, Nerolac',
    link_url:  '/category/paints',
    cta_text:  'Shop Paints',
    bg_color:  '#6d28d9',
    image_url: null,
  },
  {
    id:        'default-3',
    title:     '🔧 Plumbing Emergency?',
    subtitle:  'Pipes, fittings, taps — delivered in 60 minutes',
    link_url:  '/category/plumbing',
    cta_text:  'Order Now',
    bg_color:  '#0369a1',
    image_url: null,
  },
];

export default function HeroBanner({ banners = DEFAULT_BANNERS, autoPlayMs = 5000 }) {
  const items   = banners.length ? banners : DEFAULT_BANNERS;
  const [idx,      setIdx]      = useState(0);
  const [paused,   setPaused]   = useState(false);
  const [touching, setTouching] = useState(null); // touch start X
  const timerRef = useRef(null);

  const next = useCallback(() => setIdx(i => (i + 1) % items.length), [items.length]);
  const prev = useCallback(() => setIdx(i => (i - 1 + items.length) % items.length), [items.length]);

  // Auto-advance
  useEffect(() => {
    if (paused || items.length <= 1) return;
    timerRef.current = setInterval(next, autoPlayMs);
    return () => clearInterval(timerRef.current);
  }, [paused, next, autoPlayMs, items.length]);

  // Touch swipe
  const onTouchStart = (e) => setTouching(e.touches[0].clientX);
  const onTouchEnd   = (e) => {
    if (touching === null) return;
    const dx = e.changedTouches[0].clientX - touching;
    if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); }
    setTouching(null);
  };

  const banner = items[idx];
  const bg     = banner.image_url
    ? `url(${banner.image_url}) center/cover no-repeat`
    : `linear-gradient(135deg, ${banner.bg_color || '#f97316'}, ${banner.bg_color || '#f97316'}cc)`;

  return (
    <div
      style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', marginBottom: 28, userSelect: 'none' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-roledescription="carousel"
      aria-label="Featured promotions"
    >
      {/* Slide */}
      <div style={{
        background: bg,
        minHeight:  220,
        display:    'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding:    '32px 28px 28px',
        position:   'relative',
      }}>
        {/* Overlay for text readability on images */}
        {banner.image_url && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' }} />
        )}

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{
            fontSize: 'clamp(1.2rem,3.5vw,1.8rem)', fontWeight: 900,
            color: '#fff', marginBottom: 6, lineHeight: 1.2,
            textShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}>
            {banner.title}
          </h2>
          {banner.subtitle && (
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', marginBottom: 16, maxWidth: 400 }}>
              {banner.subtitle}
            </p>
          )}
          {banner.link_url && (
            <Link href={banner.link_url}
              style={{
                display: 'inline-block', padding: '10px 22px', borderRadius: 10,
                background: '#fff', color: banner.bg_color || '#f97316',
                fontWeight: 800, fontSize: 14, textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>
              {banner.cta_text || 'Shop Now'} →
            </Link>
          )}
        </div>
      </div>

      {/* Prev / Next arrows */}
      {items.length > 1 && (
        <>
          <button onClick={prev} aria-label="Previous banner"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.12)', zIndex: 2 }}>
            ‹
          </button>
          <button onClick={next} aria-label="Next banner"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.12)', zIndex: 2 }}>
            ›
          </button>
        </>
      )}

      {/* Dot indicators */}
      {items.length > 1 && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 2 }}>
          {items.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`Go to slide ${i + 1}`}
              style={{
                width: i === idx ? 20 : 8, height: 8,
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: i === idx ? '#fff' : 'rgba(255,255,255,0.5)',
                transition: 'width 0.3s, background 0.3s',
                padding: 0,
              }} />
          ))}
        </div>
      )}
    </div>
  );
}
