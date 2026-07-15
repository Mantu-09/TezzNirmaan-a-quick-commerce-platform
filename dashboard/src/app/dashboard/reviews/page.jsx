'use client';
// ────────────────────────────────────────────────────────────
// Dashboard Reviews Page — B4
// Shows shop rating summary (avg scores, total count) and
// a paginated table of individual reviews with flag controls.
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';

// ── Star display helper ───────────────────────────────────────
function Stars({ value, size = 14 }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span style={{ color: '#F59E0B', fontSize: size, letterSpacing: 2 }}>
      {'★'.repeat(Math.max(0, rounded))}
      {'☆'.repeat(Math.max(0, 5 - rounded))}
    </span>
  );
}

// ── Score card ────────────────────────────────────────────────
function ScoreCard({ label, value, count, icon }) {
  const num = Number(value);
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font)', fontSize: 32, fontWeight: 800, color: 'var(--text)' }}>
        {num > 0 ? num.toFixed(1) : '—'}
      </div>
      {num > 0 && <Stars value={num} />}
      {count != null && (
        <div style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
          {count.toLocaleString()} rating{count !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// ── Review row ────────────────────────────────────────────────
function ReviewRow({ review, onFlag }) {
  const overallAvg = [review.deliveryRating, review.productRating]
    .filter(Boolean)
    .reduce((a, b, _, arr) => a + b / arr.length, 0);

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={tdStyle}>
        <div style={{ fontFamily: 'var(--font)', fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>
          {review.reviewer}
        </div>
        <div style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          {new Date(review.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      </td>

      {/* Delivery rating */}
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        {review.deliveryRating != null
          ? <><Stars value={review.deliveryRating} size={13} /><div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{review.deliveryRating}/5</div></>
          : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
        }
      </td>

      {/* Product rating */}
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        {review.productRating != null
          ? <><Stars value={review.productRating} size={13} /><div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{review.productRating}/5</div></>
          : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
        }
      </td>

      {/* Review text */}
      <td style={{ ...tdStyle, maxWidth: 320 }}>
        {review.reviewText
          ? <p style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>"{review.reviewText}"</p>
          : <span style={{ color: 'var(--text-3)', fontSize: 12, fontStyle: 'italic' }}>No written review</span>
        }
      </td>

      {/* Flag action */}
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <button
          onClick={() => onFlag(review.id, !review.isFlagged)}
          title={review.isFlagged ? 'Remove flag' : 'Flag for attention'}
          style={{
            border:          'none',
            background:      'none',
            cursor:          'pointer',
            fontSize:        20,
            opacity:         review.isFlagged ? 1 : 0.3,
            transition:      'opacity 0.2s',
          }}
        >
          🚩
        </button>
      </td>
    </tr>
  );
}

// ── Skeleton row ─────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {[160, 80, 80, 260, 50].map((w, i) => (
        <td key={i} style={tdStyle}>
          <div style={{ height: 14, width: w, borderRadius: 6, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
        </td>
      ))}
    </tr>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState() {
  return (
    <tr>
      <td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
        <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>
          No reviews yet
        </div>
        <div style={{ fontFamily: 'var(--font)', fontSize: 14, color: 'var(--text-2)' }}>
          Once customers rate their delivered orders, you'll see their reviews here.
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function ReviewsPage() {
  const [summary,  setSummary]  = useState(null);
  const [ratings,  setRatings]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [hasMore,  setHasMore]  = useState(false);
  const [filter,   setFilter]   = useState('all'); // 'all' | 'flagged' | 'with_review'
  const LIMIT = 20;

  const fetchSummary = useCallback(async () => {
    try {
      const d = await api.get('/shop/ratings/summary');
      setSummary(d?.summary);
    } catch {}
  }, []);

  const fetchRatings = useCallback(async (p = 1, reset = false) => {
    setLoading(true);
    try {
      const d = await api.get(`/shop/ratings?page=${p}&limit=${LIMIT}`);
      const rows = d?.ratings || [];
      // Client-side filter (backend paginates all; filter is UI-only for now)
      const filtered = filter === 'flagged'     ? rows.filter(r => r.isFlagged)
                     : filter === 'with_review' ? rows.filter(r => r.reviewText)
                     : rows;
      if (reset) {
        setRatings(filtered);
      } else {
        setRatings(prev => [...prev, ...filtered]);
      }
      setTotal(d?.total || 0);
      setHasMore(d?.hasMore || false);
      setPage(p);
    } catch (e) {
      console.error('Reviews fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchSummary(); }, []);
  useEffect(() => { fetchRatings(1, true); }, [filter]);

  const handleFlag = async (ratingId, flagged) => {
    try {
      await api.patch(`/shop/ratings/${ratingId}/flag`, { flagged });
      setRatings(prev => prev.map(r => r.id === ratingId ? { ...r, isFlagged: flagged } : r));
    } catch {}
  };

  const flaggedCount = ratings.filter(r => r.isFlagged).length;

  return (
    <div style={{ padding: 'var(--s6)', fontFamily: 'var(--font)' }}>
      {/* Page header */}
      <div style={{ marginBottom: 'var(--s6)' }}>
        <h1 style={{ fontFamily: 'var(--font)', fontWeight: 800, fontSize: 22, color: 'var(--text)', margin: 0 }}>
          Customer Reviews
        </h1>
        <p style={{ fontFamily: 'var(--font)', fontSize: 14, color: 'var(--text-2)', marginTop: 4 }}>
          See how customers rate your shop's delivery and product quality.
        </p>
      </div>

      {/* Score cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--s4)', marginBottom: 'var(--s6)' }}>
        <ScoreCard
          icon="⭐"
          label="Overall Rating"
          value={summary?.avg_overall_rating}
          count={summary?.total_ratings}
        />
        <ScoreCard
          icon="🛵"
          label="Delivery Speed"
          value={summary?.avg_delivery_rating}
        />
        <ScoreCard
          icon="📦"
          label="Product Quality"
          value={summary?.avg_product_rating}
        />
        <div style={cardStyle}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>💬</div>
          <div style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>Written Reviews</div>
          <div style={{ fontFamily: 'var(--font)', fontSize: 32, fontWeight: 800, color: 'var(--text)' }}>
            {summary?.total_reviews ?? '—'}
          </div>
        </div>
      </div>

      {/* Flagged alert banner */}
      {flaggedCount > 0 && (
        <div style={{
          background:    '#FEF3C7',
          border:        '1px solid #F59E0B',
          borderRadius:  'var(--r-md)',
          padding:       'var(--s3) var(--s4)',
          marginBottom:  'var(--s4)',
          display:       'flex',
          alignItems:    'center',
          gap:           8,
          fontFamily:    'var(--font)',
          fontSize:      14,
          color:         '#92400E',
        }}>
          🚩 <strong>{flaggedCount}</strong> flagged review{flaggedCount !== 1 ? 's' : ''} need your attention.
          <button onClick={() => setFilter('flagged')} style={{ marginLeft: 'auto', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13 }}>
            View flagged
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 'var(--s2)', marginBottom: 'var(--s4)' }}>
        {[
          { key: 'all',         label: `All (${total})` },
          { key: 'with_review', label: '💬 With review' },
          { key: 'flagged',     label: `🚩 Flagged${flaggedCount ? ` (${flaggedCount})` : ''}` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              border:          filter === f.key ? '1.5px solid var(--primary)' : '1px solid var(--border)',
              borderRadius:    'var(--r-md)',
              padding:         '6px 16px',
              background:      filter === f.key ? 'var(--primary)' : 'var(--surface)',
              color:           filter === f.key ? '#fff' : 'var(--text)',
              fontFamily:      'var(--font)',
              fontWeight:      filter === f.key ? 600 : 400,
              fontSize:        13,
              cursor:          'pointer',
              transition:      'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Reviews table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {['Customer', 'Delivery ⚡', 'Product 📦', 'Review', 'Flag'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && ratings.length === 0
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : ratings.length === 0
                ? <EmptyState />
                : ratings.map(r => (
                    <ReviewRow key={r.id} review={r} onFlag={handleFlag} />
                  ))
            }
          </tbody>
        </table>

        {/* Load more */}
        {hasMore && !loading && (
          <div style={{ padding: 'var(--s4)', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => fetchRatings(page + 1)}
              style={{
                background:   'var(--surface-2)',
                border:       '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding:      '8px 28px',
                cursor:       'pointer',
                fontFamily:   'var(--font)',
                fontWeight:   600,
                fontSize:     14,
                color:        'var(--text)',
              }}
            >
              Load more reviews
            </button>
          </div>
        )}

        {loading && ratings.length > 0 && (
          <div style={{ padding: 'var(--s3)', textAlign: 'center', fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font)' }}>
            Loading…
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────
const cardStyle = {
  background:   'var(--surface)',
  border:       '1px solid var(--border)',
  borderRadius: 'var(--r-lg)',
  padding:      'var(--s5)',
  textAlign:    'center',
  boxShadow:    'var(--shadow-sm)',
};

const thStyle = {
  padding:       '10px 14px',
  fontSize:      12,
  fontWeight:    700,
  color:         'var(--text-2)',
  textAlign:     'left',
  borderBottom:  '2px solid var(--border)',
  fontFamily:    'var(--font)',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
};

const tdStyle = {
  padding:   '12px 14px',
  fontSize:  14,
  verticalAlign: 'top',
};
