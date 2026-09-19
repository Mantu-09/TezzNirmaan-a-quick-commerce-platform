'use client';
// Next.js loading.jsx — Admin New Shop form
// Form skeleton while the shop creation page loads (e.g., if it fetches categories/products).

export default function AdminNewShopLoading() {
  return (
    <div style={{ padding: 'var(--s6)', fontFamily: 'var(--font)', maxWidth: 760 }}>
      {/* Breadcrumb skeleton */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 'var(--s5)' }}>
        <div style={skel(14, 80, 4)} />
        <div style={skel(14, 12, 0)} />
        <div style={skel(14, 100, 4)} />
      </div>

      {/* Page title */}
      <div style={skel(32, 220, 6, 0, 8)} />
      <div style={skel(14, 340, 4, 0, 4)} />

      {/* Form card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', padding: 'var(--s6)',
        marginTop: 'var(--s5)',
        animation: 'pulse 1.4s ease infinite',
      }}>
        {/* Section heading */}
        <div style={skel(16, 160, 4, 0, 20)} />

        {/* Two-column field row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div>
            <div style={skel(12, 80, 4, 0, 6)} />
            <div style={skel(40, '100%', 8)} />
          </div>
          <div>
            <div style={skel(12, 100, 4, 0, 6)} />
            <div style={skel(40, '100%', 8)} />
          </div>
        </div>

        {/* Full-width textarea */}
        <div style={{ marginBottom: 20 }}>
          <div style={skel(12, 120, 4, 0, 6)} />
          <div style={skel(96, '100%', 8)} />
        </div>

        {/* Another two-column row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div>
            <div style={skel(12, 60, 4, 0, 6)} />
            <div style={skel(40, '100%', 8)} />
          </div>
          <div>
            <div style={skel(12, 90, 4, 0, 6)} />
            <div style={skel(40, '100%', 8)} />
          </div>
        </div>

        {/* Divider + section heading */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginBottom: 20 }}>
          <div style={skel(16, 180, 4)} />
        </div>

        {/* More fields */}
        {[140, 200, 160].map((w, i) => (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={skel(12, w, 4, 0, 6)} />
            <div style={skel(40, '100%', 8)} />
          </div>
        ))}

        {/* Submit button */}
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
