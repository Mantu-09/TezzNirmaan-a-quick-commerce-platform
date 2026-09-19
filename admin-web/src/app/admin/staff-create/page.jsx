'use client';
// -----------------------------------------------------------------------------
// Admin — Create Staff Account  (/admin/staff-create)
// Allows platform_admin to create shop_owner, rider, or shop_staff accounts.
// On success shows a credential card with copy + WhatsApp buttons.
// Keeps a rolling list of the last 5 created accounts in component state.
// -----------------------------------------------------------------------------
import { useState } from 'react';
import { api } from '../../../lib/api';

const NAVY   = '#0D3B6E';
const ORANGE = '#E8740C';

const ROLE_LABELS = {
  shop_owner: 'Shop Owner',
  rider:      'Rider',
  shop_staff: 'Shop Staff',
};

export default function StaffCreatePage() {
  // Form state
  const [fullName, setFullName] = useState('');
  const [phone,    setPhone]    = useState('');
  const [role,     setRole]     = useState('shop_owner');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Result state
  const [created,    setCreated]    = useState(null);
  const [copied,     setCopied]     = useState(false);
  const [recentList, setRecentList] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone)) { setError('Enter a valid 10-digit mobile number'); return; }
    if (!fullName.trim())         { setError('Full name is required'); return; }

    setError(''); setLoading(true); setCreated(null);
    try {
      const resp = await api.post('/admin/staff', {
        full_name: fullName.trim(),
        phone:     '+91' + phone,
        role,
      });
      const result = resp.data;
      setCreated(result);
      setRecentList(prev => [
        { ...result.user, tempPassword: result.tempPassword, createdAt: new Date().toLocaleTimeString() },
        ...prev,
      ].slice(0, 5));
      setFullName(''); setPhone(''); setRole('shop_owner');
    } catch (err) {
      setError(err.message || 'Failed to create staff account');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(created?.tempPassword || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (!created) return;
    const digits = created.user.phone.replace(/\D/g, '');
    const msg = encodeURIComponent(
      'Welcome to TezzNirmaan! Your account has been created.\n\n' +
      'Phone: ' + created.user.phone + '\n' +
      'Password: ' + created.tempPassword + '\n' +
      'Role: ' + (ROLE_LABELS[created.user.role] || created.user.role) + '\n\n' +
      'Log in at: https://dashboard.tezznirmaan.in/login\n' +
      'Please change your password after first login.'
    );
    window.open('https://wa.me/' + digits + '?text=' + msg, '_blank');
  };

  const cardStyle = {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    padding: '28px 32px', marginBottom: 24,
  };
  const labelStyle = { display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: '#374151' };
  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };
  const btnPrimary = {
    padding: '11px 24px', borderRadius: 8, background: ORANGE, color: '#fff',
    fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer',
    opacity: loading ? 0.6 : 1,
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>Create Staff Account</div>
        <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
          Create login credentials for shop owners, riders, or shop staff. Credentials are sent via SMS.
        </div>
      </div>

      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              background: '#fef2f2', color: '#dc2626', borderRadius: 8,
              padding: '10px 14px', fontSize: 13, marginBottom: 20, fontWeight: 500,
            }}>
              {'\u26a0\ufe0f'} {error}
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Full Name</label>
            <input style={inputStyle} type="text" placeholder="e.g. Ramesh Kumar"
              value={fullName} onChange={e => { setFullName(e.target.value); setError(''); }} required />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Phone Number</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                padding: '10px 12px', background: '#f8fafc', border: '1.5px solid #d1d5db',
                borderRadius: 8, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', fontSize: 14,
              }}>+91</div>
              <input style={{ ...inputStyle, flex: 1 }} type="tel" inputMode="numeric"
                placeholder="10-digit mobile number" maxLength={10}
                value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }} required />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Role</label>
            <select style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}
              value={role} onChange={e => setRole(e.target.value)}>
              <option value="shop_owner">Shop Owner</option>
              <option value="rider">Rider</option>
              <option value="shop_staff">Shop Staff</option>
            </select>
          </div>

          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? 'Creating\u2026' : '+ Create Account'}
          </button>
        </form>
      </div>

      {created && (
        <div style={{ ...cardStyle, border: '2px solid #16a34a', background: '#f0fdf4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 22 }}>{'\u2705'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d' }}>Account Created Successfully</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Share these credentials securely with the user</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Role',           value: ROLE_LABELS[created.user.role] || created.user.role },
              { label: 'Phone',          value: created.user.phone },
              { label: 'Internal Email', value: created.user.email },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #d1fae5',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2, wordBreak: 'break-all' }}>{value}</div>
              </div>
            ))}
            <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #d1fae5' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Temp Password</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <code style={{ fontSize: 14, fontWeight: 700, color: NAVY, letterSpacing: '0.5px', flex: 1 }}>
                  {created.tempPassword}
                </code>
                <button onClick={handleCopy} style={{
                  padding: '3px 10px', borderRadius: 6, border: '1px solid ' + NAVY,
                  background: copied ? NAVY : 'transparent', color: copied ? '#fff' : NAVY,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {copied ? '\u2713 Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleWhatsApp} style={{
              padding: '9px 18px', borderRadius: 8, background: '#25D366', color: '#fff',
              fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>{'\ud83d\udcac'}</span> Send via WhatsApp
            </button>
            <button onClick={() => setCreated(null)} style={{
              padding: '9px 18px', borderRadius: 8, border: '1.5px solid #d1d5db',
              background: 'transparent', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {recentList.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 14 }}>
            Recently Created (this session)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  {['Time', 'Phone', 'Role', 'Temp Password'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600,
                      fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentList.map((acc, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i === 0 ? '#f0fdf4' : 'transparent' }}>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{acc.createdAt}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: NAVY }}>{acc.phone}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: acc.role === 'rider' ? '#dbeafe' : acc.role === 'shop_owner' ? '#fef3c7' : '#f3f4f6',
                        color:      acc.role === 'rider' ? '#1d4ed8' : acc.role === 'shop_owner' ? '#b45309' : '#374151',
                      }}>
                        {ROLE_LABELS[acc.role] || acc.role}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <code style={{ fontSize: 12, color: '#374151', background: '#f8fafc', padding: '2px 6px', borderRadius: 4 }}>
                        {acc.tempPassword}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
