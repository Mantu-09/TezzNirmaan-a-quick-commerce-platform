// B7: Root layout loading state — shown during initial page load
// Next.js App Router: this file is automatically used as the loading UI
// for the root layout segment while async components are suspended.
export default function RootLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        display:    'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{
          width:        40,
          height:       40,
          borderRadius: '50%',
          border:       '3px solid var(--border)',
          borderTop:    '3px solid var(--primary)',
          animation:    'spin 0.8s linear infinite',
        }} />
        <p style={{
          fontFamily: 'var(--font)',
          fontSize:   14,
          color:      'var(--text-2)',
        }}>
          Loading…
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
