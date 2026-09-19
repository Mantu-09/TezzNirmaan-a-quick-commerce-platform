// TD-07: Order Detail loading skeleton
// Shown by Next.js while /dashboard/orders/[id]/page.jsx is loading data.
// Matches the layout of the real page: header strip, status timeline, items table, action bar.
export default function OrderDetailLoading() {
  return (
    <div style={{ padding: 'var(--s6)', maxWidth: 860, fontFamily: 'var(--font)' }}>
      {/* Back link + title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s5)' }}>
        <div style={{ ...skel, width: 80, height: 18 }} />
        <div style={{ ...skel, width: 220, height: 26 }} />
      </div>

      {/* Status chip row */}
      <div style={{ display: 'flex', gap: 'var(--s3)', marginBottom: 'var(--s5)' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ ...skel, width: 100, height: 32, borderRadius: 20 }} />
        ))}
      </div>

      {/* Status timeline strip */}
      <div style={{ ...card, marginBottom: 'var(--s4)' }}>
        <div style={{ ...skel, height: 14, width: 100, marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 'var(--s2)' }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ flex: 1 }}>
              <div style={{ ...skel, height: 10, width: '100%', marginBottom: 6 }} />
              <div style={{ ...skel, height: 10, width: '60%' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Order items card */}
      <div style={{ ...card, marginBottom: 'var(--s4)' }}>
        <div style={{ ...skel, height: 16, width: 140, marginBottom: 16 }} />
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ ...skel, height: 14, width: '55%' }} />
            <div style={{ ...skel, height: 14, width: '15%' }} />
            <div style={{ ...skel, height: 14, width: '18%' }} />
          </div>
        ))}
        {/* Totals */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ ...skel, height: 14, width: 80 }} />
            <div style={{ ...skel, height: 14, width: 70 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ ...skel, height: 18, width: 60 }} />
            <div style={{ ...skel, height: 18, width: 80 }} />
          </div>
        </div>
      </div>

      {/* Customer + delivery info card */}
      <div style={{ ...card, marginBottom: 'var(--s4)' }}>
        <div style={{ ...skel, height: 16, width: 160, marginBottom: 16 }} />
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', gap: 'var(--s4)', marginBottom: 10 }}>
            <div style={{ ...skel, height: 13, width: 90 }} />
            <div style={{ ...skel, height: 13, width: 200 }} />
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 'var(--s3)' }}>
        <div style={{ ...skel, height: 42, width: 160, borderRadius: 8 }} />
        <div style={{ ...skel, height: 42, width: 120, borderRadius: 8 }} />
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
