import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font, sans-serif)', padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 64, fontWeight: 900, color: 'var(--primary, #E8521A)', lineHeight: 1 }}>
        404
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text, #111)', margin: '12px 0 8px' }}>
        Page not found
      </h1>
      <p style={{ color: 'var(--text-2, #666)', fontSize: 15, maxWidth: 380, margin: '0 0 24px' }}>
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        style={{
          background: 'var(--primary, #E8521A)', color: '#fff', textDecoration: 'none',
          borderRadius: 8, padding: '10px 24px', fontSize: 15, fontWeight: 600,
        }}
      >
        Back to home
      </Link>
    </div>
  );
}
