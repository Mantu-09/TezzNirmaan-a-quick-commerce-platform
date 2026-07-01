'use client';
import useAuthStore from '../../store/authStore';
import { useRouter } from 'next/navigation';

export default function RiderShell({ children }) {
  const { user, clearSession } = useAuthStore();
  const router = useRouter();

  const handleSignOut = () => {
    clearSession();
    router.push('/login');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      maxWidth: 640,
      margin: '0 auto',
    }}>
      {/* Simple header */}
      <header style={{
        background:   'var(--sidebar-bg)',
        padding:      '16px 20px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 18 }}>
            TezzNirmaan
          </div>
          <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>
            {user?.full_name || 'Delivery Partner'}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          style={{
            background: 'rgba(255,255,255,0.1)', color: '#fff',
            border: 'none', borderRadius: 'var(--r-lg)',
            padding: '8px 14px', fontSize: 13, cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
      </header>

      <main style={{ padding: '20px' }}>
        {children}
      </main>
    </div>
  );
}
