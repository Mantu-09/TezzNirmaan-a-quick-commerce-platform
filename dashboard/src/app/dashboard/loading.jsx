// B7: Dashboard segment loading state
// Shown while the dashboard layout's async data is being fetched.
// Uses the design system CSS variables.
export default function DashboardLoading() {
  return (
    <div style={{
      padding:    'var(--s6)',
      maxWidth:   1100,
      fontFamily: 'var(--font)',
    }}>
      {/* Page header skeleton */}
      <div style={{ marginBottom: 'var(--s6)' }}>
        <div style={{ ...skel, height: 28, width: 200, marginBottom: 8 }} />
        <div style={{ ...skel, height: 14, width: 140 }} />
      </div>

      {/* Stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s4)', marginBottom: 'var(--s5)' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={card}>
            <div style={{ ...skel, height: 36, marginBottom: 10 }} />
            <div style={{ ...skel, height: 14, width: '60%' }} />
          </div>
        ))}
      </div>

      {/* Content cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s4)' }}>
        {[1, 2].map(i => (
          <div key={i} style={{ ...card, height: 200 }}>
            <div style={{ ...skel, height: 18, width: '40%', marginBottom: 16 }} />
            {[1, 2, 3].map(j => (
              <div key={j} style={{ ...skel, height: 14, marginBottom: 10 }} />
            ))}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

const skel = {
  borderRadius:  6,
  background:    'var(--surface-2)',
  animation:     'pulse 1.4s ease infinite',
};

const card = {
  background:   'var(--surface)',
  border:       '1px solid var(--border)',
  borderRadius: 'var(--r-lg)',
  padding:      'var(--s5)',
};
