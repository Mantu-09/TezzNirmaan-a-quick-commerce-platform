// ─────────────────────────────────────────────────────────────
// (storefront)/components/ProductReviews.jsx — P12-5
//
// Client component for product page review section.
// Shows star rating summary, review list, and submit form
// (auth-gated — shows "Sign in to review" if logged out).
//
// Props:
//   productId: string (UUID)
//   productName: string
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';
import Cookies                  from 'js-cookie';

const API = '/api/backend';

// ── Star display ──────────────────────────────────────────────
function Stars({ rating, size = 16, interactive = false, onChange }) {
  const [hover, setHover] = useState(0);
  const display = interactive ? (hover || rating) : rating;
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          style={{
            fontSize: size, cursor: interactive ? 'pointer' : 'default',
            color: n <= display ? '#f59e0b' : '#d1d5db',
            transition: 'color 0.1s',
          }}
          onClick={() => interactive && onChange?.(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          aria-label={interactive ? `Rate ${n} star${n !== 1 ? 's' : ''}` : undefined}
          role={interactive ? 'button' : undefined}
        >★</span>
      ))}
    </span>
  );
}

// ── Rating breakdown bar ──────────────────────────────────────
function RatingBar({ label, count, total }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--sf-text-2,#6b7280)', width: 30, textAlign: 'right' }}>{label}★</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#f3f4f6', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#f59e0b', borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--sf-text-3,#9ca3af)', width: 28 }}>{count}</span>
    </div>
  );
}

// ── Review card ───────────────────────────────────────────────
function ReviewCard({ review }) {
  return (
    <div style={{ padding: '16px 0', borderBottom: '1px solid var(--sf-border,#f3f4f6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <Stars rating={review.rating} size={14} />
          {review.title && <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: 'var(--sf-text,#111827)' }}>{review.title}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {review.is_verified && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: 10 }}>
              ✓ Verified Purchase
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--sf-text-3,#9ca3af)' }}>
            {new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
          </span>
        </div>
      </div>
      {review.body && <p style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)', lineHeight: 1.6, margin: 0 }}>{review.body}</p>}
    </div>
  );
}

// ── Submit form ───────────────────────────────────────────────
function ReviewForm({ productId, onSubmitted }) {
  const token = Cookies.get('tn_token');
  const [rating,   setRating]   = useState(0);
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  if (!token) return (
    <div style={{ padding: '16px', borderRadius: 12, background: 'var(--sf-bg,#f9fafb)', border: '1px solid var(--sf-border,#e5e7eb)', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)', marginBottom: 10 }}>Sign in to leave a review</div>
      <a href="/auth?redirect=/product" style={{ color: 'var(--sf-primary,#f97316)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Sign In →</a>
    </div>
  );

  const submit = async (e) => {
    e.preventDefault();
    if (rating === 0) { setError('Please select a star rating'); return; }
    setSaving(true); setError('');
    try {
      const res  = await fetch(`${API}/customer/products/${productId}/reviews`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ rating, title: title.trim(), body: body.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not submit review');
      setSuccess(true);
      onSubmitted?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (success) return (
    <div style={{ padding: '16px', borderRadius: 12, background: '#dcfce7', border: '1px solid #86efac', textAlign: 'center' }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>🎉</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>Thanks for your review!</div>
      <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>It will appear after admin approval.</div>
    </div>
  );

  return (
    <form onSubmit={submit} style={{ padding: '16px', borderRadius: 12, background: 'var(--sf-bg,#f9fafb)', border: '1px solid var(--sf-border,#e5e7eb)' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Write a Review</h3>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sf-text-2,#6b7280)', marginBottom: 6 }}>Your Rating *</div>
        <Stars rating={rating} size={28} interactive onChange={setRating} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <input
          placeholder="Review title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={100}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--sf-border,#e5e7eb)', fontSize: 13, background: '#fff', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <textarea
          placeholder="Share your experience with this product…"
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={1000}
          rows={3}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--sf-border,#e5e7eb)', fontSize: 13, background: '#fff', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </div>

      {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{error}</div>}

      <button type="submit" disabled={saving || rating === 0}
        style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--sf-primary,#f97316)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Submitting…' : 'Submit Review'}
      </button>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────
export default function ProductReviews({ productId, avgRating = 0, reviewCount = 0 }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

  const load = () => {
    setLoading(true);
    fetch(`${API}/public/products/${productId}/reviews?limit=10`)
      .then(r => r.json())
      .then(json => {
        const list = json.data?.reviews || json.reviews || [];
        setReviews(list);
        const bd = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        list.forEach(r => { if (bd[r.rating] !== undefined) bd[r.rating]++; });
        setBreakdown(bd);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (productId) load(); }, [productId]);

  const total = reviews.length;
  const displayRating = avgRating || (total ? (Object.entries(breakdown).reduce((s, [k, v]) => s + +k * v, 0) / total) : 0);

  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 20 }}>
        Customer Reviews {reviewCount > 0 && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--sf-text-2,#9ca3af)' }}>({reviewCount})</span>}
      </h2>

      {/* Rating summary */}
      {(reviewCount > 0 || total > 0) && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24, padding: '16px', background: 'var(--sf-surface,#fff)', borderRadius: 12, border: '1px solid var(--sf-border,#e5e7eb)' }}>
          <div style={{ textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: 'var(--sf-text,#111827)' }}>
              {displayRating.toFixed(1)}
            </div>
            <Stars rating={Math.round(displayRating)} size={18} />
            <div style={{ fontSize: 11, color: 'var(--sf-text-3,#9ca3af)', marginTop: 4 }}>{reviewCount || total} reviews</div>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            {[5, 4, 3, 2, 1].map(n => (
              <RatingBar key={n} label={n} count={breakdown[n] || 0} total={total} />
            ))}
          </div>
        </div>
      )}

      {/* Review list */}
      {loading ? (
        <div style={{ color: 'var(--sf-text-3,#9ca3af)', fontSize: 13, marginBottom: 20 }}>Loading reviews…</div>
      ) : reviews.length === 0 ? (
        <div style={{ color: 'var(--sf-text-2,#6b7280)', fontSize: 13, marginBottom: 20 }}>
          No reviews yet. Be the first to review this product!
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}

      {/* Submit form */}
      <ReviewForm productId={productId} onSubmitted={load} />
    </div>
  );
}
