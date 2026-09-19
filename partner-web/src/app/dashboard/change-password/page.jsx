'use client';
// -----------------------------------------------------------------------------
// Shop Owner — Change Password  (/dashboard/change-password)
// Allows shop_owner to change their own login password.
// -----------------------------------------------------------------------------
import { useState } from 'react';
import Link from 'next/link';
import { authApi } from '../../../lib/api';

const NAVY   = '#0D3B6E';
const ORANGE = '#E8740C';

export default function DashboardChangePasswordPage() {
  const [currentPw,   setCurrentPw]   = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!currentPw)          { setError('Current password is required'); return; }
    if (newPw.length < 8)    { setError('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setError('New passwords do not match'); return; }
    if (currentPw === newPw) { setError('New password must differ from current password'); return; }

    setLoading(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      setSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setError(err.message || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputWrap  = { position: 'relative', marginBottom: 20 };
  const inputStyle = {
    width: '100%', padding: '11px 44px 11px 14px', borderRadius: 10,
    border: '1.5px solid #d1d5db', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const eyeBtn = {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, padding: 0,
  };
  const labelStyle = { display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: '#374151' };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f1f5f9', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.09)', padding: '36px 40px',
      }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>Change Password</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Update your shop dashboard login password.</div>
        </div>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>{'\ud83c\udf89'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>Password Changed!</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
              Your password has been updated successfully. Use it the next time you log in.
            </div>
            <Link href="/dashboard/summary" style={{
              display: 'inline-block', padding: '11px 28px', borderRadius: 10,
              background: NAVY, color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}>
              {'\u2190'} Back to Dashboard
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#fef2f2', color: '#dc2626', borderRadius: 8,
                padding: '10px 14px', fontSize: 13, marginBottom: 20, fontWeight: 500,
              }}>
                {'\u26a0\ufe0f'} {error}
              </div>
            )}

            <label style={labelStyle}>Current Password</label>
            <div style={inputWrap}>
              <input style={inputStyle} type={showCurrent ? 'text' : 'password'}
                placeholder="Your current password" value={currentPw} autoFocus
                onChange={e => { setCurrentPw(e.target.value); setError(''); }} />
              <button type="button" style={eyeBtn} onClick={() => setShowCurrent(v => !v)}
                aria-label={showCurrent ? 'Hide' : 'Show'}>{showCurrent ? '\ud83d\ude48' : '\ud83d\udc41\ufe0f'}</button>
            </div>

            <label style={labelStyle}>New Password</label>
            <div style={inputWrap}>
              <input style={inputStyle} type={showNew ? 'text' : 'password'}
                placeholder="Minimum 8 characters" value={newPw}
                onChange={e => { setNewPw(e.target.value); setError(''); }} />
              <button type="button" style={eyeBtn} onClick={() => setShowNew(v => !v)}
                aria-label={showNew ? 'Hide' : 'Show'}>{showNew ? '\ud83d\ude48' : '\ud83d\udc41\ufe0f'}</button>
            </div>

            <label style={labelStyle}>Confirm New Password</label>
            <div style={inputWrap}>
              <input style={inputStyle} type={showConfirm ? 'text' : 'password'}
                placeholder="Repeat new password" value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setError(''); }} />
              <button type="button" style={eyeBtn} onClick={() => setShowConfirm(v => !v)}
                aria-label={showConfirm ? 'Hide' : 'Show'}>{showConfirm ? '\ud83d\ude48' : '\ud83d\udc41\ufe0f'}</button>
            </div>

            {newPw.length > 0 && newPw.length < 8 && (
              <div style={{ fontSize: 12, color: '#f59e0b', marginTop: -14, marginBottom: 16 }}>
                {'\u26a0\ufe0f'} Password too short ({newPw.length}/8 characters)
              </div>
            )}

            <button type="submit"
              disabled={loading || !currentPw || newPw.length < 8 || !confirmPw}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, background: ORANGE,
                color: '#fff', fontWeight: 700, fontSize: 15, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: (loading || !currentPw || newPw.length < 8 || !confirmPw) ? 0.6 : 1,
                marginBottom: 16,
              }}>
              {loading ? 'Changing Password\u2026' : 'Change Password'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <Link href="/dashboard/summary" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none', fontWeight: 500 }}>
                {'\u2190'} Back to Dashboard
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
