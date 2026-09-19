// ─────────────────────────────────────────────────────────────
// (storefront)/profile/page.jsx — P12-1
//
// Customer profile page: name, phone, default address, logout.
// Auth-gated: redirects to /auth?redirect=/profile if not logged in.
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';
import { useRouter }           from 'next/navigation';
import Link                    from 'next/link';
import Cookies                 from 'js-cookie';

const API = '/api/backend';

export default function ProfilePage() {
  const router = useRouter();
  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [form,     setForm]     = useState({ full_name: '', email: '' });

  useEffect(() => {
    const token = Cookies.get('tn_token');
    if (!token) { router.push('/auth?redirect=/profile'); return; }
    fetch(`${API}/customer/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => {
        const p = json.data || json;
        setProfile(p);
        setForm({ full_name: p.full_name || '', email: p.email || '' });
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [router]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const token = Cookies.get('tn_token');
      const res = await fetch(`${API}/customer/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to save');
      setProfile(prev => ({ ...prev, ...form }));
      setSuccess('Profile updated ✓');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    Cookies.remove('tn_token');
    Cookies.remove('tn_refresh');
    router.push('/');
  };

  const card  = { background: 'var(--sf-surface,#fff)', borderRadius: 16, padding: '20px 24px', border: '1px solid var(--sf-border,#e5e7eb)', marginBottom: 16 };
  const label = { fontSize: 12, fontWeight: 700, color: 'var(--sf-text-2,#6b7280)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 };
  const inp   = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--sf-border,#e5e7eb)', fontSize: 14, background: 'var(--sf-bg,#f9fafb)', color: 'var(--sf-text,#111827)', boxSizing: 'border-box' };

  if (loading) return (
    <div className="sf-wrap" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--sf-text-2,#6b7280)' }}>
      Loading profile…
    </div>
  );

  return (
    <div className="sf-wrap sf-section" style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)', marginBottom: 20 }}>
        <Link href="/" style={{ color: 'var(--sf-primary,#f97316)' }}>Home</Link> › My Profile
      </div>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 24 }}>My Profile</h1>

      {/* Quick nav */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { href: '/orders',   icon: '📦', label: 'Orders'   },
          { href: '/wallet',   icon: '💰', label: 'Wallet'   },
          { href: '/loyalty',  icon: '🎟️', label: 'Loyalty'  },
          { href: '/referral', icon: '🎁', label: 'Refer'    },
          { href: '/track',    icon: '🚴', label: 'Track'    },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '12px 8px', borderRadius: 12, border: '1px solid var(--sf-border,#e5e7eb)',
            background: 'var(--sf-surface,#fff)', fontSize: 11, fontWeight: 700,
            color: 'var(--sf-text-2,#6b7280)', textDecoration: 'none', transition: 'border-color 0.15s',
          }}>
            <span style={{ fontSize: 22 }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      {/* Profile form */}
      <form onSubmit={save} style={card}>
        <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700 }}>Personal Information</h2>

        <div style={{ marginBottom: 16 }}>
          <label style={label}>Phone Number</label>
          <input style={{ ...inp, background: 'var(--sf-surface-2,#f3f4f6)', cursor: 'not-allowed' }}
            value={profile?.phone || ''} readOnly title="Phone cannot be changed" />
          <span style={{ fontSize: 11, color: 'var(--sf-text-2,#9ca3af)', marginTop: 4, display: 'block' }}>
            Phone number cannot be changed
          </span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={label}>Full Name</label>
          <input style={inp} placeholder="Your name"
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={label}>Email (optional)</label>
          <input style={inp} type="email" placeholder="your@email.com"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>

        {error   && <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ fontSize: 13, color: '#16a34a', marginBottom: 12 }}>{success}</div>}

        <button type="submit" disabled={saving}
          className="sf-btn sf-btn-primary" style={{ width: '100%' }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      {/* Sign out */}
      <div style={card}>
        <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Account</h2>
        <button onClick={logout}
          style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #fca5a5', background: '#fff5f5', color: '#dc2626', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%' }}>
          🚪 Sign Out
        </button>
      </div>
    </div>
  );
}
