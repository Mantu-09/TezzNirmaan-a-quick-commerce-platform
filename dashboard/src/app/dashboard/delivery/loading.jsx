// B7: Delivery segment loading state
export default function DeliveryLoading() {
  return (
    <div style={{ padding: 'var(--s5)', fontFamily: 'var(--font)' }}>
      <div style={{ ...skel, height: 26, width: 160, marginBottom: 20 }} />
      {[1,2,3].map(i => (
        <div key={i} style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...skel, height: 16, width: 100 }} />
            <div style={{ ...skel, height: 22, width: 80, borderRadius: 10 }} />
          </div>
          <div style={{ ...skel, height: 13, width: '60%', marginBottom: 6 }} />
          <div style={{ ...skel, height: 13, width: '40%' }} />
        </div>
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
const skel = { borderRadius: 4, background: 'var(--surface-2)', animation: 'pulse 1.4s ease infinite' };
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 'var(--s4)' };
