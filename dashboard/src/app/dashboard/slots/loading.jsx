// B7: Slots segment loading
export default function SlotsLoading() {
  return (
    <div style={{ padding: 'var(--s6)', fontFamily: 'var(--font)', maxWidth: 1000 }}>
      <div style={{ ...skel, height: 26, width: 160, marginBottom: 8 }} />
      <div style={{ ...skel, height: 14, width: 240, marginBottom: 24 }} />
      {/* Tab row */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
        <div style={{ ...skel, height: 36, width: 120, borderRadius: '6px 0 0 6px' }} />
        <div style={{ ...skel, height: 36, width: 120, borderRadius: '0 6px 6px 0', opacity: 0.5 }} />
      </div>
      {/* Slot cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 14 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ ...card }}>
            <div style={{ ...skel, height: 18, width: '70%', marginBottom: 8 }} />
            <div style={{ ...skel, height: 8, marginBottom: 6, borderRadius: 4 }} />
            <div style={{ ...skel, height: 11, width: '50%' }} />
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
const skel = { borderRadius: 4, background: 'var(--surface-2)', animation: 'pulse 1.4s ease infinite' };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 'var(--s5)' };
