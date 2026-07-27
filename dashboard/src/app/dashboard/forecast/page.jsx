'use client';
// ────────────────────────────────────────────────────────────
// Forecast Page — P5-2
// Route: /dashboard/forecast
// Only accessible to shop_owner (ownerOnly in the nav guard).
// ────────────────────────────────────────────────────────────
import DemandForecastCard from '../../../components/DemandForecastCard';

export default function ForecastPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          🧠 AI Demand Forecast
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-secondary)' }}>
          Powered by Claude — helps you restock before you run out.
        </p>
      </div>

      {/* 7-day forecast */}
      <DemandForecastCard days={7} />

      {/* Explainer */}
      <div style={{
        backgroundColor: 'var(--surface)',
        border:          '1px solid var(--border)',
        borderRadius:    12,
        padding:         20,
      }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
          How does this work?
        </p>
        <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            'Claude analyses your last 30 days of sales data.',
            'It considers your current stock levels vs. historical velocity.',
            'Seasonal patterns specific to Bihar construction industry are factored in — e.g. monsoon slows exterior work, winter is peak season.',
            'Results are cached for 30 minutes to keep costs low.',
            'If the forecast looks wrong, check that your inventory stock quantities are up to date.',
          ].map((point, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
