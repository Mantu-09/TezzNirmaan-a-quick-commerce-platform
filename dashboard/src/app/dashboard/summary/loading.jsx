// B7: Summary segment loading
export default function SummaryLoading() {
  return (
    <div style={{ padding: 'var(--s5)', fontFamily: 'var(--font)' }}>
      <div style={{ ...skel, height: 24, width: 160, marginBottom: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={card}>
            <div style={{ ...skel, height: 11, width: 60, marginBottom: 10 }} />
            <div style={{ ...skel, height: 28, width: 80 }} />
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={{ ...skel, height: 14, width: 100, marginBottom: 14 }} />
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...skel, height: 12, width: '55%' }} />
            <div style={{ ...skel, height: 12, width: 50 }} />
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
const skel = { borderRadius: 4, background: 'var(--surface-2)', animation: 'pulse 1.4s ease infinite' };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 'var(--s4)' };
