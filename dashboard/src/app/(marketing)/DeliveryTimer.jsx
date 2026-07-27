'use client';
// DeliveryTimer — P3-A signature element
//
// A live ticking clock that counts up from 0:00 on page load,
// resetting to 0 every 90 minutes. It is a UX device — a concrete
// demonstration that this platform is about speed, not a real order timer.
//
// Design: shows "Your cement in HH:MM:SS" in JetBrains Mono.
// The number ticks every second via requestAnimationFrame / setInterval.

import { useState, useEffect, useRef } from 'react';

const RESET_AFTER_MS = 90 * 60 * 1000; // 90 minutes

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function DeliveryTimer() {
  const startRef  = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startRef.current = Date.now();

    const id = setInterval(() => {
      const diff = Date.now() - startRef.current;
      if (diff >= RESET_AFTER_MS) {
        startRef.current = Date.now();
        setElapsed(0);
      } else {
        setElapsed(diff);
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  return (
    <div className="mkt-timer-card">
      <div className="mkt-timer-label" aria-hidden="true">Live Delivery Timer</div>
      <div className="mkt-timer-headline">
        <strong>Your cement</strong> could already be on its way
      </div>

      {/* The signature number — aria-live only on the changing value */}
      <div
        className="mkt-timer-value"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`Estimated delivery time: ${formatElapsed(elapsed)}`}
        suppressHydrationWarning
      >
        {formatElapsed(elapsed)}
      </div>

      <div className="mkt-timer-sub" aria-hidden="true">
        <span className="mkt-timer-dot" aria-hidden="true" />
        Live orders being dispatched from Patna shops right now
      </div>

      {/* Tier labels */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
        {[
          { label: '⚡ Quick',     desc: '60–90 min' },
          { label: '📅 Scheduled', desc: 'Same day' },
        ].map(({ label, desc }) => (
          <div
            key={label}
            style={{
              flex:          '1 1 0',
              background:    'rgba(255,255,255,0.06)',
              border:        '1px solid rgba(255,255,255,0.1)',
              borderRadius:  '10px',
              padding:       '12px 16px',
              minWidth:      '120px',
            }}
          >
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', fontWeight: 600, marginBottom: '4px' }}>
              {label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: '#fff' }}>
              {desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
