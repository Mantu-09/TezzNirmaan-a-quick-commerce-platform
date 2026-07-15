// B7: Inventory segment loading state
export default function InventoryLoading() {
  return (
    <div style={{ padding: 'var(--s5)', fontFamily: 'var(--font)' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, justifyContent: 'space-between' }}>
        <div style={{ ...skel, height: 36, width: 240, borderRadius: 'var(--r-md)' }} />
        <div style={{ ...skel, height: 36, width: 120, borderRadius: 'var(--r-md)' }} />
      </div>
      <div style={{ borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: 0, background: 'var(--surface-2)', padding: '10px 14px' }}>
          {['Product', 'Price', 'Stock', 'Tier', ''].map((h, i) => (
            <div key={i} style={{ ...skel, height: 12, width: 60, opacity: 0.6 }} />
          ))}
        </div>
        {/* Rows */}
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: 0, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ ...skel, height: 14, width: '80%' }} />
            <div style={{ ...skel, height: 14, width: 60 }} />
            <div style={{ ...skel, height: 14, width: 40 }} />
            <div style={{ ...skel, height: 20, width: 70, borderRadius: 10 }} />
            <div style={{ ...skel, height: 14, width: 50 }} />
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
const skel = { borderRadius: 4, background: 'var(--surface-2)', animation: 'pulse 1.4s ease infinite' };
