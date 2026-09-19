// ─────────────────────────────────────────────────────────────
// app/offline/page.jsx — P11-4
//
// Served by the service worker when a navigation request fails
// because the user is offline.
// 'use client' required for onClick (window.location.reload).
// ─────────────────────────────────────────────────────────────
'use client';

export default function OfflinePage() {
  return (
    <html lang="en">
      <head>
        <title>Offline — TezzNirmaan</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100dvh', padding: '24px',
          textAlign: 'center', background: '#1A1A18', color: 'white',
        }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>📦</div>
          <h1 style={{ fontSize: '1.5rem', margin: '12px 0 8px', color: '#E8521A' }}>
            You are offline
          </h1>
          <p style={{ color: '#9ca3af', margin: '0 0 8px', maxWidth: 280, lineHeight: 1.5 }}>
            Check your internet connection and try again.
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 24px', maxWidth: 280, lineHeight: 1.5 }}>
            Your cart is saved locally and will be ready when you are back online.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 28px', background: '#E8521A', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: '1rem', fontWeight: 600, letterSpacing: 0.2,
            }}
          >
            Try again
          </button>
          <a href="/" style={{ marginTop: 16, color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>
            Back to home
          </a>
        </div>
      </body>
    </html>
  );
}
