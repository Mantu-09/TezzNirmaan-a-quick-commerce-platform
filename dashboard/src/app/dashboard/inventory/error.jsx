'use client';
// B7: Generic error boundary for most dashboard segments.
// Segments that don't have their own error.jsx will use the
// parent dashboard/error.jsx — that's fine. Individual segments
// can have this file if they need custom recovery UX.
import { useEffect } from 'react';
import { captureError } from '../../../../lib/sentry-client';

export default function InventoryError({ error, reset }) {
  useEffect(() => { captureError(error, { segment: 'inventory' }); }, [error]);

  return (
    <div style={{ padding: 'var(--s5)', fontFamily: 'var(--font)' }}>
      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--r-lg)', padding: 'var(--s5)' }}>
        <p style={{ fontFamily: 'var(--font)', fontWeight: 700, color: '#991B1B', marginBottom: 8 }}>
          ⚠️ Failed to load inventory
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 13, color: '#7F1D1D', marginBottom: 16 }}>
          {error?.message || 'Try refreshing the page.'}
        </p>
        <button onClick={reset} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '7px 16px', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13 }}>
          Retry
        </button>
      </div>
    </div>
  );
}
