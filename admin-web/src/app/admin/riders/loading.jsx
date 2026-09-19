'use client';
// Next.js loading.jsx — Admin Riders list
// Shows a table skeleton while riders data loads.

export default function AdminRidersLoading() {
  const rows = Array.from({ length: 8 });

  return (
    <div style={{ padding: 'var(--s6)', fontFamily: 'var(--font)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s5)' }}>
        <div>
          <div style={skel(28, 180, 6, 0, 8)} />
          <div style={skel(14, 260, 4)} />
        </div>
        <div style={skel(36, 130, 8)} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 'var(--s4)' }}>
        <div style={skel(36, 200, 8)} />
        <div style={skel(36, 120, 8)} />
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
          gap: 16, padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          {['Rider', 'Status', 'Assigned Shop', 'Deliveries', ''].map(col => (
            <div key={col} style={skel(12, col ? '70%' : 40, 4)} />
          ))}
        </div>

        {rows.map((_, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
            gap: 16, padding: '14px 20px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
            animation: 'pulse 1.4s ease infinite',
            animationDelay: `${i * 60}ms`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ ...skel(38, 38, '50%'), flexShrink: 0 }} />
              <div>
                <div style={skel(14, 130, 4, 0, 4)} />
                <div style={skel(12, 100, 4)} />
              </div>
            </div>
            <div style={skel(22, 72, 12)} />
            <div style={skel(14, 110, 4)} />
            <div style={skel(14, 40, 4)} />
            <div style={skel(28, 60, 6)} />
          </div>
        ))}
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
