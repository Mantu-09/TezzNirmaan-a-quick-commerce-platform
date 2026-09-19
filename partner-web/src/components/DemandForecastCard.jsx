'use client';
// ────────────────────────────────────────────────────────────
// DemandForecastCard — P5-2
//
// Shows AI-generated stock forecast for the logged-in shop owner.
// Refreshes every 30 min (matches server-side Redis cache TTL).
//
// Sections:
//   🚨 Restock urgently  — likely out in 3 days
//   ⚠️  Restock soon     — likely out in 7 days
//   📈 Demand trend      — one-sentence outlook
//   🌧️  Seasonal note    — monsoon / winter context
//
// Design: dark card with orange accent, subtle "Powered by AI" label.
// ────────────────────────────────────────────────────────────
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

// ── API call ──────────────────────────────────────────────────
async function fetchForecast(days = 7) {
  return api.get(`/shop/demand-forecast?days=${days}`);
}

// ── Sub-components ────────────────────────────────────────────

function ProductPill({ name, urgent }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      backgroundColor: urgent ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
      color:           urgent ? '#ef4444' : '#ca8a04',
      border:          `1px solid ${urgent ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)'}`,
      borderRadius: 20,
      padding: '3px 10px',
      fontSize: 12,
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      {urgent ? '🚨' : '⚠️'} {name}
    </span>
  );
}

function EmptyRow({ text }) {
  return (
    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, fontStyle: 'italic' }}>
      {text}
    </p>
  );
}

function SkeletonLine({ width = '60%' }) {
  return (
    <div style={{
      height: 14, width, borderRadius: 7,
      backgroundColor: 'var(--border)', opacity: 0.7,
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  );
}

// ── Main Component ───────────────────────────────────────────

export default function DemandForecastCard({ days = 7 }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey:      ['demand-forecast', days],
    queryFn:       () => fetchForecast(days),
    staleTime:     30 * 60 * 1000,  // 30 min — matches server cache TTL
    refetchInterval: 30 * 60 * 1000,
  });

  const forecast = data?.forecast;

  return (
    <div style={card}>
      {/* Header */}
      <div style={header}>
        <div style={headerLeft}>
          <span style={headerIcon}>🧠</span>
          <div>
            <h3 style={title}>AI Demand Forecast</h3>
            <p style={subtitle}>Next {days} days · Updates every 30 min</p>
          </div>
        </div>
        <span style={aiBadge}>✨ Powered by Claude</span>
      </div>

      {/* Body */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SkeletonLine width="80%" />
          <SkeletonLine width="60%" />
          <SkeletonLine width="90%" />
        </div>
      ) : isError ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Could not load forecast.
          </p>
          <button onClick={refetch} style={retryBtn}>Try again</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Restock urgently */}
          <section>
            <p style={sectionLabel}>🚨 Restock urgently <span style={urgentTag}>within 3 days</span></p>
            {forecast?.restock_urgently?.length ? (
              <div style={pillWrap}>
                {forecast.restock_urgently.map(name => (
                  <ProductPill key={name} name={name} urgent />
                ))}
              </div>
            ) : (
              <EmptyRow text="All urgent items are well stocked ✓" />
            )}
          </section>

          {/* Restock soon */}
          <section>
            <p style={sectionLabel}>⚠️ Restock soon <span style={warnTag}>within 7 days</span></p>
            {forecast?.restock_soon?.length ? (
              <div style={pillWrap}>
                {forecast.restock_soon.map(name => (
                  <ProductPill key={name} name={name} urgent={false} />
                ))}
              </div>
            ) : (
              <EmptyRow text="No items expected to run low this week ✓" />
            )}
          </section>

          {/* Demand trend */}
          {forecast?.demand_trend && (
            <section style={infoBox}>
              <p style={infoLabel}>📈 This week's demand</p>
              <p style={infoText}>{forecast.demand_trend}</p>
            </section>
          )}

          {/* Seasonal note */}
          {forecast?.seasonal_note && (
            <section style={{ ...infoBox, borderColor: 'rgba(99,102,241,0.25)', backgroundColor: 'rgba(99,102,241,0.06)' }}>
              <p style={infoLabel}>🌧️ Seasonal context</p>
              <p style={infoText}>{forecast.seasonal_note}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles (inline — no Tailwind dependency) ─────────────────

const card = {
  backgroundColor: 'var(--surface)',
  border:          '1px solid var(--border)',
  borderRadius:    16,
  padding:         24,
  display:         'flex',
  flexDirection:   'column',
  gap:             20,
};

const header = {
  display:        'flex',
  alignItems:     'flex-start',
  justifyContent: 'space-between',
  gap:            12,
};

const headerLeft = {
  display:    'flex',
  alignItems: 'center',
  gap:        12,
};

const headerIcon = {
  fontSize:        28,
  lineHeight:      '1',
  flexShrink:      0,
};

const title = {
  margin:     0,
  fontSize:   16,
  fontWeight: 700,
  color:      'var(--text)',
};

const subtitle = {
  margin:   0,
  fontSize: 12,
  color:    'var(--text-tertiary)',
  marginTop: 2,
};

const aiBadge = {
  fontSize:        11,
  fontWeight:      600,
  color:           'var(--primary)',
  backgroundColor: 'rgba(255,111,0,0.1)',
  border:          '1px solid rgba(255,111,0,0.2)',
  borderRadius:    20,
  padding:         '3px 10px',
  whiteSpace:      'nowrap',
  flexShrink:      0,
};

const sectionLabel = {
  fontSize:    13,
  fontWeight:  600,
  color:       'var(--text-secondary)',
  margin:      0,
  marginBottom: 8,
  display:     'flex',
  alignItems:  'center',
  gap:         6,
};

const urgentTag = {
  fontSize:        11,
  fontWeight:      500,
  backgroundColor: 'rgba(239,68,68,0.1)',
  color:           '#ef4444',
  borderRadius:    20,
  padding:         '1px 8px',
};

const warnTag = {
  ...urgentTag,
  backgroundColor: 'rgba(234,179,8,0.1)',
  color:           '#ca8a04',
};

const pillWrap = {
  display:   'flex',
  flexWrap:  'wrap',
  gap:       8,
};

const infoBox = {
  backgroundColor: 'rgba(255,111,0,0.05)',
  border:          '1px solid rgba(255,111,0,0.15)',
  borderRadius:    10,
  padding:         '12px 14px',
};

const infoLabel = {
  fontSize:    12,
  fontWeight:  600,
  color:       'var(--text-secondary)',
  margin:      0,
  marginBottom: 4,
};

const infoText = {
  fontSize:   13,
  color:      'var(--text)',
  margin:     0,
  lineHeight: '1.5',
};

const retryBtn = {
  marginTop:       8,
  padding:         '6px 16px',
  backgroundColor: 'var(--primary)',
  color:           '#fff',
  border:          'none',
  borderRadius:    8,
  fontSize:        13,
  cursor:          'pointer',
};
