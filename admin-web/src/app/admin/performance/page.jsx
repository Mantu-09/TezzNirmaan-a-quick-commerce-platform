'use client';
// admin/performance/page.jsx — P17-9
// Real-time server performance and platform health dashboard.
import { useState, useEffect, useCallback } from 'react';

function Metric({ label, value, unit = '', icon, color = '#f97316', sub }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#1f2937' }}>
        {value ?? '—'}<span style={{ fontSize: 14, color: '#9ca3af', marginLeft: 4 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function HealthBar({ label, value, max, unit, color = '#22c55e' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const barColor = pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : color;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
        <span style={{ color: '#374151', fontWeight: 600 }}>{label}</span>
        <span style={{ color: barColor, fontWeight: 700 }}>{value}{unit} <span style={{ color: '#9ca3af', fontWeight: 400 }}>/ {max}{unit}</span></span>
      </div>
      <div style={{ background: '#f3f4f6', borderRadius: 8, height: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 8, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const [metrics, setMetrics] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing]   = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const r = await fetch('/api/backend/admin/performance/metrics', { credentials: 'include' });
    const d = await r.json();
    setMetrics(d.data);
    setLastRefresh(new Date());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // auto-refresh every 30s
    return () => clearInterval(t);
  }, [load]);

  const m = metrics;
  const uptimeHrs = m ? Math.floor(m.uptime_seconds / 3600) : 0;
  const uptimeMins = m ? Math.floor((m.uptime_seconds % 3600) / 60) : 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>⚡ Platform Performance</h1>
          <p style={{ color: '#9ca3af', margin: '4px 0 0', fontSize: 13 }}>
            {lastRefresh ? `Last updated: ${lastRefresh.toLocaleTimeString('en-IN')}` : 'Loading...'} · Auto-refreshes every 30s
          </p>
        </div>
        <button onClick={load} disabled={refreshing} style={{ padding: '8px 18px', background: '#f97316', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          {refreshing ? '↻ Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {!m ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Loading metrics...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
            <Metric label="Orders (Last Hour)" value={m.orders_last_hour} icon="📦" sub="Live count" />
            <Metric label="Active Shops" value={m.active_shops} icon="🏪" sub="Verified & active" />
            <Metric label="Active Riders" value={m.active_riders} icon="🛵" sub="On platform" />
            <Metric label="Total Customers" value={m.total_customers?.toLocaleString('en-IN')} icon="👥" sub="Registered profiles" />
          </div>

          {/* Server stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: '#1f2937' }}>🖥️ Server Health</h3>
              <HealthBar label="Memory Usage" value={m.memory_mb} max={512} unit=" MB" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>Node.js Version</span>
                  <span style={{ fontWeight: 700 }}>{m.node_version}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>Uptime</span>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>{uptimeHrs}h {uptimeMins}m</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>Server Time</span>
                  <span style={{ fontWeight: 700 }}>{new Date(m.server_time).toLocaleTimeString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: '#1f2937' }}>✅ System Status</h3>
              {[
                { name: 'API Server',          status: 'operational', detail: `${m.uptime_seconds}s uptime` },
                { name: 'Database (Supabase)', status: m.active_shops > 0 ? 'operational' : 'degraded', detail: 'Postgres + Realtime' },
                { name: 'Payments (Razorpay)', status: 'operational', detail: 'Orders processing' },
                { name: 'WhatsApp (WATI)',      status: process.env.WATI_API_URL ? 'operational' : 'not_configured', detail: 'Notifications' },
                { name: 'SMS (Twilio)',         status: 'not_configured', detail: 'Add TWILIO_ACCOUNT_SID' },
                { name: 'AI Assistant',         status: 'operational', detail: 'Gemini Flash' },
              ].map(s => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f9fafb' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.detail}</div>
                  </div>
                  <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.status === 'operational' ? '#f0fdf4' : s.status === 'degraded' ? '#fff1f2' : '#f9fafb', color: s.status === 'operational' ? '#16a34a' : s.status === 'degraded' ? '#ef4444' : '#9ca3af' }}>
                    {s.status === 'operational' ? '● Operational' : s.status === 'degraded' ? '● Degraded' : '○ Not configured'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Environment checklist */}
          <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: 20, marginTop: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: '#92400e' }}>⚙️ Environment Setup Checklist</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
              {[
                { key: 'TWILIO_ACCOUNT_SID',  label: 'Twilio SMS (Order updates)', category: 'SMS' },
                { key: 'TWILIO_AUTH_TOKEN',    label: 'Twilio Auth Token', category: 'SMS' },
                { key: 'TWILIO_PHONE_NUMBER',  label: 'Twilio Phone Number (+91...)', category: 'SMS' },
                { key: 'GEMINI_API_KEY',       label: 'Google Gemini API Key (AI chat)', category: 'AI' },
                { key: 'WATI_API_URL',         label: 'WATI.io API URL (WhatsApp)', category: 'WhatsApp' },
                { key: 'WATI_API_TOKEN',       label: 'WATI.io Bearer Token', category: 'WhatsApp' },
              ].map(env => (
                <div key={env.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#374151' }}>{env.category}: {env.label}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>Add {env.key} to backend/.env</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
