// ─────────────────────────────────────────────────────────────
// admin/reviews/page.jsx — P12-10
//
// Admin review moderation queue.
// Shows pending reviews (is_approved=false), allows approve/reject.
// Approved reviews auto-update product avg_rating via DB trigger.
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         ANON_KEY,
      Authorization:  `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'return=representation',
      ...(opts.headers || {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

function Stars({ rating }) {
  return (
    <span>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>
  );
}

export default function ReviewsAdmin() {
  const [tab,     setTab]     = useState('pending'); // 'pending' | 'approved'
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = (t = tab) => {
    setLoading(true);
    const filter = t === 'pending' ? 'is_approved=eq.false' : 'is_approved=eq.true';
    sbFetch(`product_reviews?${filter}&select=*,products(name)&order=created_at.desc&limit=50`)
      .then(setReviews)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const switchTab = (t) => { setTab(t); load(t); };

  const approve = async (r) => {
    await sbFetch(`product_reviews?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ is_approved: true }) });
    setReviews(prev => prev.filter(x => x.id !== r.id));
  };

  const reject = async (r) => {
    if (!confirm('Delete this review permanently?')) return;
    await sbFetch(`product_reviews?id=eq.${r.id}`, { method: 'DELETE' });
    setReviews(prev => prev.filter(x => x.id !== r.id));
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>⭐ Review Moderation</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Approve reviews before they appear on product pages.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['pending', 'approved'].map(t => (
          <button key={t} onClick={() => switchTab(t)}
            style={{ padding: '7px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none', background: tab === t ? '#f97316' : '#f3f4f6', color: tab === t ? '#fff' : '#374151' }}>
            {t === 'pending' ? '⏳ Pending' : '✅ Approved'}
          </button>
        ))}
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>
      ) : reviews.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: 28, textAlign: 'center', border: '2px dashed #e5e7eb', borderRadius: 12 }}>
          {tab === 'pending' ? '🎉 No pending reviews!' : 'No approved reviews yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {reviews.map(r => (
            <div key={r.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
                    {r.products?.name || 'Unknown Product'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#f59e0b', fontSize: 16 }}><Stars rating={r.rating} /></span>
                    {r.is_verified && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 7px', borderRadius: 8 }}>✓ Verified Purchase</span>
                    )}
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</span>
                  </div>
                </div>
                {tab === 'pending' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => approve(r)}
                      style={{ padding: '6px 14px', borderRadius: 8, background: '#dcfce7', color: '#166534', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      ✅ Approve
                    </button>
                    <button onClick={() => reject(r)}
                      style={{ padding: '6px 14px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>
              {r.title && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{r.title}</div>}
              {r.body  && <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>{r.body}</p>}
              <div style={{ marginTop: 8, fontSize: 11, color: '#d1d5db', fontFamily: 'monospace' }}>
                ID: {r.customer_id?.slice(0, 8)}… · Product: {r.product_id?.slice(0, 8)}…
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
