// B7: Orders segment loading state
// Shown while the orders page suspends (e.g. initial data fetch).
// Matches the OrderCard layout — dense row skeletons.
export default function OrdersLoading() {
  return (
    <div style={{ padding: 'var(--s5)', fontFamily: 'var(--font)' }}>
      {/* Filter bar skeleton */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ ...skel, height: 32, width: 80, borderRadius: 20 }} />
        ))}
      </div>
      {/* Order card skeletons */}
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...skel, height: 16, width: 120 }} />
            <div style={{ ...skel, height: 22, width: 70, borderRadius: 10 }} />
          </div>
          <div style={{ ...skel, height: 13, width: '70%', marginBottom: 8 }} />
          <div style={{ ...skel, height: 13, width: '50%' }} />
        </div>
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

const skel = {
  borderRadius: 4,
  background: 'var(--surface-2)',
  animation: 'pulse 1.4s ease infinite',
};

const card = {
  background:   'var(--surface)',
  border:       '1px solid var(--border)',
  borderRadius: 'var(--r-lg)',
  padding:      'var(--s4)',
};
