// B7: Analytics segment loading state — chart-shaped skeletons
export default function AnalyticsLoading() {
  return (
    <div style={{ padding: 'var(--s6)', fontFamily: 'var(--font)', maxWidth: 1000 }}>
      <div style={{ ...skel, height: 28, width: 180, marginBottom: 24 }} />
      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[1,2,3].map(i => <div key={i} style={{ ...skel, height: 32, width: 80, borderRadius: 20 }} />)}
      </div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[1,2,3].map(i => (
          <div key={i} style={card}>
            <div style={{ ...skel, height: 14, width: 80, marginBottom: 12 }} />
            <div style={{ ...skel, height: 32, width: '60%' }} />
          </div>
        ))}
      </div>
      {/* Chart placeholder */}
      <div style={{ ...card, height: 200, marginBottom: 16 }}>
        <div style={{ ...skel, height: 16, width: 140, marginBottom: 12 }} />
        <div style={{ ...skel, height: 140, width: '100%' }} />
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
const skel = { borderRadius: 4, background: 'var(--surface-2)', animation: 'pulse 1.4s ease infinite' };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 'var(--s5)' };
