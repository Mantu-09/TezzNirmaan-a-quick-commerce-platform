'use client';
// B7: Orders segment error boundary
import { useEffect } from 'react';
import { captureError } from '../../../../lib/sentry-client';

export default function OrdersError({ error, reset }) {
  useEffect(() => {
    captureError(error, { segment: 'orders' });
  }, [error]);

  return (
    <div style={{ padding: 'var(--s5)', fontFamily: 'var(--font)' }}>
      <div style={{
        background:   '#FEF2F2', border: '1px solid #FECACA',
        borderRadius: 'var(--r-lg)', padding: 'var(--s5)',
      }}>
        <p style={{ fontFamily: 'var(--font)', fontWeight: 700, color: '#991B1B', marginBottom: 8 }}>
          ⚠️ Failed to load orders
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 13, color: '#7F1D1D', marginBottom: 16 }}>
          {error?.message || 'Check your connection and try again.'}
        </p>
        <button onClick={reset} style={{
          background: 'var(--primary)', color: '#fff', border: 'none',
          borderRadius: 'var(--r-md)', padding: '7px 16px',
          cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13,
        }}>
          Retry
        </button>
      </div>
    </div>
  );
}
