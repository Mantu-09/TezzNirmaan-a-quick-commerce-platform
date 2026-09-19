'use client';
// B7: Dashboard segment error boundary
// Shown when an unhandled error is thrown during rendering of
// any dashboard page. The 'use client' directive is required —
// Next.js error boundaries must be client components.
import { useEffect } from 'react';
import { captureError } from '../../lib/sentry-client'; // thin client-side wrapper

export default function DashboardError({ error, reset }) {
  useEffect(() => {
    // Report to Sentry (client-side) on every distinct error
    captureError(error, { segment: 'dashboard' });
  }, [error]);

  return (
    <div style={{
      padding:    'var(--s6)',
      fontFamily: 'var(--font)',
      maxWidth:   600,
    }}>
      <div style={{
        background:   '#FEF2F2',
        border:       '1px solid #FECACA',
        borderRadius: 'var(--r-lg)',
        padding:      'var(--s6)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <h2 style={{
          fontFamily: 'var(--font)',
          fontWeight: 700,
          fontSize:   18,
          color:      '#991B1B',
          margin:     '0 0 8px',
        }}>
          Something went wrong
        </h2>
        <p style={{
          fontFamily: 'var(--font)',
          fontSize:   14,
          color:      '#7F1D1D',
          marginBottom: 20,
        }}>
          {error?.message || 'An unexpected error occurred. Our team has been notified.'}
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
            onClick={() => window.location.href = '/dashboard/orders'}
            style={{
              background:   'var(--surface)',
              color:        'var(--text)',
              border:       '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding:      '8px 18px',
              cursor:       'pointer',
              fontFamily:   'var(--font)',
              fontWeight:   400,
              fontSize:     14,
            }}
          >
            Go to Orders
          </button>
        </div>
      </div>
    </div>
  );
}
