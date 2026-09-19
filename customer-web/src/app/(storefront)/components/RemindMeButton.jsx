// (storefront)/components/RemindMeButton.jsx — P14-4
// "Remind me when back in stock" or "Remind me to reorder"
// Calls POST /customer/reminders — shows toast on success.
'use client';
import { useState } from 'react';

export default function RemindMeButton({ productId, type = 'restock', label }) {
  const [state, setState] = useState('idle'); // idle | loading | done | error

  async function handleClick() {
    setState('loading');
    try {
      const r = await fetch('/api/backend/customer/reminders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, reminder_type: type }),
      });
      setState(r.ok ? 'done' : 'error');
    } catch { setState('error'); }
  }

  const texts = {
    idle:    label || (type === 'restock' ? '🔔 Remind me when back' : '⏰ Remind me to reorder'),
    loading: 'Setting reminder...',
    done:    '✅ Reminder set!',
    error:   '❌ Try again',
  };

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading' || state === 'done'}
      style={{
        padding: '7px 16px', borderRadius: 8, border: '1.5px solid #e5e7eb',
        background: state === 'done' ? '#f0fdf4' : '#fff',
        color: state === 'done' ? '#16a34a' : '#374151',
        fontSize: 13, fontWeight: 600, cursor: state === 'done' ? 'default' : 'pointer',
        transition: 'all .2s',
      }}
    >
      {texts[state]}
    </button>
  );
}
