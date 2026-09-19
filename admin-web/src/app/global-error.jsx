'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#fff' }}>
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
            TezzNirmaan is temporarily unavailable
          </h1>
          <p style={{ color: '#666', fontSize: 14, maxWidth: 400, margin: '0 0 24px' }}>
            Something went wrong loading the page. Please refresh or try again in a moment.
          </p>
          <button
            onClick={reset}
            style={{
              background: '#E8521A', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Refresh page
          </button>
        </div>
      </body>
    </html>
  );
}
