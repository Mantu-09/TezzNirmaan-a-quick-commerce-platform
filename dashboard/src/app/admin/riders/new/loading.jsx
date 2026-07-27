'use client';
// Next.js loading.jsx — Admin New Rider form
// Form skeleton while the rider creation page loads.

export default function AdminNewRiderLoading() {
  return (
    <div style={{ padding: 'var(--s6)', fontFamily: 'var(--font)', maxWidth: 640 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 'var(--s5)' }}>
        <div style={skel(14, 80, 4)} />
        <div style={skel(14, 12, 0)} />
        <div style={skel(14, 100, 4)} />
      </div>

      {/* Page title */}
      <div style={skel(32, 200, 6, 0, 8)} />
      <div style={skel(14, 300, 4, 0, 4)} />

      {/* Form card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', padding: 'var(--s6)',
        marginTop: 'var(--s5)',
        animation: 'pulse 1.4s ease infinite',
      }}>
        {/* Personal details section */}
        <div style={skel(16, 160, 4, 0, 20)} />

        {[
          [100, '1fr 1fr'],
          [100, '1fr 1fr'],
          [100, '1fr'],
        ].map(([h, cols], i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 20, marginBottom: 20 }}>
            {cols.split(' ').map((_, j) => (
              <div key={j}>
                <div style={skel(12, [80, 100, 120][j % 3], 4, 0, 6)} />
                <div style={skel(h, '100%', 8)} />
              </div>
            ))}
          </div>
        ))}

        {/* Assignment section */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginBottom: 20 }}>
          <div style={skel(16, 140, 4, 0, 20)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={skel(12, 90, 4, 0, 6)} />
              <div style={skel(40, '100%', 8)} />
            </div>
            <div>
              <div style={skel(12, 110, 4, 0, 6)} />
              <div style={skel(40, '100%', 8)} />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
          <div style={skel(40, 100, 8)} />
          <div style={skel(40, 140, 8)} />
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function skel(h, w, r, mb = 0, mt = 0) {
  return {
    height: h,
    width: typeof w === 'number' ? w : w,
    borderRadius: r,
    marginBottom: mb,
    marginTop: mt,
    background: 'var(--surface-2)',
  };
}
