'use client';
// TD-08: Admin Riders error boundary
// Shown when an unhandled error is thrown in the admin/riders/* segment.
// Must be a Client Component (Next.js requirement for error.jsx files).
import { useEffect } from 'react';

export default function AdminRidersError({ error, reset }) {
  useEffect(() => {
    // Log to console in development; replace with Sentry in production
    console.error('[AdminRiders Error]', error);
  }, [error]);

  return (
    <div style={{ padding: 'var(--s6)', fontFamily: 'var(--font)', maxWidth: 640 }}>
      <div style={{
        background:   '#FEF2F2',
        border:       '1px solid #FECACA',
        borderRadius: 'var(--r-lg)',
        padding:      'var(--s6)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🛵</div>
        <h2 style={{
          fontFamily: 'var(--font)',
          fontWeight: 700,
          fontSize:   18,
          color:      '#991B1B',
          margin:     '0 0 8px',
        }}>
          Failed to load riders
        </h2>
        <p style={{
          fontFamily:   'var(--font)',
          fontSize:     14,
          color:        '#7F1D1D',
          marginBottom: 20,
        }}>
          {error?.message || 'An unexpected error occurred while loading the riders list.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={reset}
            style={{
              background:   'var(--primary)',
              color:        '#fff',
              border:       'none',
              borderRadius: 'var(--r-md)',
              padding:      '8px 18px',
              cursor:       'pointer',
              fontFamily:   'var(--font)',
              fontWeight:   600,
              fontSize:     14,
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/admin/riders'}
            style={{
              background:   'var(--surface)',
              color:        'var(--text)',
              border:       '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding:      '8px 18px',
              cursor:       'pointer',
              fontFamily:   'var(--font)',
              fontSize:     14,
            }}
          >
            Reload riders list
          </button>
        </div>
      </div>
    </div>
  );
}
