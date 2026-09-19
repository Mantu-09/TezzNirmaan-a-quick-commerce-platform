'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('[TezzNirmaan] Unhandled error:', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font, sans-serif)', padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text, #111)', margin: '0 0 8px' }}>
        Something went wrong
      </h1>
      <p style={{ color: 'var(--text-2, #666)', fontSize: 15, maxWidth: 420, margin: '0 0 24px' }}>
        We ran into an unexpected error. Our team has been notified. Please try again.
      </p>
      <button
        onClick={reset}
        style={{
          background: 'var(--primary, #E8521A)', color: '#fff',
          border: 'none', borderRadius: 8, padding: '10px 24px',
          fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
