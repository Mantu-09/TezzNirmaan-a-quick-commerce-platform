// (storefront)/components/FlashSaleTimer.jsx — P13-5
// Live countdown timer for flash sales.
// Shows "⚡ DEAL ENDS IN 02:34:18" with red bg when < 1 hour left.
'use client';
import { useState, useEffect } from 'react';

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export default function FlashSaleTimer({ endsAt, title, discountPct }) {
  const [msLeft, setMsLeft] = useState(() => new Date(endsAt).getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = new Date(endsAt).getTime() - Date.now();
      setMsLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (msLeft <= 0) return null; // Sale ended — hide component

  const urgent = msLeft < 60 * 60 * 1000; // < 1 hour = red

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 14px', borderRadius: 20,
      background: urgent ? '#dc2626' : 'var(--sf-primary, #f97316)',
      color: '#fff', fontSize: 13, fontWeight: 800,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <span>⚡</span>
      {discountPct && <span>{discountPct}% OFF</span>}
      <span style={{ fontFamily: 'monospace', letterSpacing: 1 }}>ENDS IN {formatCountdown(msLeft)}</span>
    </div>
  );
}

// Banner row for multiple flash sales
export function FlashSalesBanner({ flashSales }) {
  if (!flashSales?.length) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0 }}>🔥 Flash Deals</h2>
        <FlashSaleTimer endsAt={flashSales[0].ends_at} discountPct={flashSales[0].discount_pct} />
      </div>
      <div style={{ overflow: 'auto', display: 'flex', gap: 12, paddingBottom: 4 }}>
        {flashSales.map(sale => (
          <div key={sale.id} style={{
            minWidth: 200, padding: '12px 16px', borderRadius: 12,
            background: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)',
            color: '#fff', flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>🔥 Flash Deal</div>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{sale.title}</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{sale.discount_pct}% OFF</div>
            {sale.category && <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>On {sale.category}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
