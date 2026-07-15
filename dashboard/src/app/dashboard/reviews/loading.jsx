// B7: Reviews segment loading
export default function ReviewsLoading() {
  return (
    <div style={{ padding: 'var(--s5)', fontFamily: 'var(--font)' }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ ...card }}>
            <div style={{ ...skel, height: 12, width: 80, marginBottom: 10 }} />
            <div style={{ ...skel, height: 28, width: 60 }} />
          </div>
        ))}
      </div>
      {/* Review rows */}
      {[1,2,3,4].map(i => (
        <div key={i} style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ ...skel, height: 14, width: 120 }} />
            <div style={{ ...skel, height: 14, width: 60 }} />
          </div>
          <div style={{ ...skel, height: 12, width: '80%', marginBottom: 6 }} />
          <div style={{ ...skel, height: 12, width: '55%' }} />
        </div>
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
const skel = { borderRadius: 4, background: 'var(--surface-2)', animation: 'pulse 1.4s ease infinite' };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 'var(--s4)' };
