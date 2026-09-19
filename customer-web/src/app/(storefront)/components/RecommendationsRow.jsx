'use client';
// (storefront)/components/RecommendationsRow.jsx — P17-1
// Horizontal scrollable product recommendation strip.
// Used on: homepage (personalized), product page (similar items).
import { useEffect, useState } from 'react';
import Link from 'next/link';

const fmt = p => p != null ? `₹${Math.round(p / 100).toLocaleString('en-IN')}` : '';

function ProductCard({ rec }) {
  return (
    <Link href={`/product/${rec.product_id}`} style={{ textDecoration: 'none', flexShrink: 0, width: 150 }}>
      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1.5px solid #f3f4f6', transition: 'box-shadow .2s' }}>
        {/* Image */}
        <div style={{ height: 120, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {rec.image_url
            ? <img src={rec.image_url} alt={rec.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
            : <span style={{ fontSize: 36 }}>🏗️</span>
          }
        </div>
        {/* Info */}
        <div style={{ padding: '10px 10px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', lineHeight: 1.3, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {rec.name}
          </div>
          {rec.brand && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{rec.brand}</div>}
          <div style={{ fontSize: 14, fontWeight: 800, color: '#f97316' }}>{fmt(rec.price_paise)}</div>
          {rec.reason && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>{rec.reason}</div>}
        </div>
      </div>
    </Link>
  );
}

/**
 * RecommendationsRow
 * Props:
 *   title        — section heading
 *   endpoint     — full fetch URL
 *   method       — 'GET' (default) or 'POST'
 *   body         — JSON body for POST
 *   emptyText    — text when no results
 */
export default function RecommendationsRow({ title = 'You May Also Like', endpoint, method = 'GET', body = null, emptyText = '' }) {
  const [recs, setRecs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!endpoint) return;
    const opts = { headers: { 'Content-Type': 'application/json' } };
    if (method === 'POST' && body) {
      opts.method = 'POST';
      opts.body   = JSON.stringify(body);
    }
    fetch(endpoint, opts)
      .then(r => r.json())
      .then(d => {
        const list = d.data?.recommendations || d.data?.similar || d.data?.fbt || [];
        setRecs(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [endpoint, body]);

  if (loading) return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, paddingLeft: 4 }}>{title}</div>
      <div style={{ display: 'flex', gap: 12 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ width: 150, height: 200, background: '#f3f4f6', borderRadius: 14, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }`}</style>
    </div>
  );

  if (!recs.length) return emptyText ? <p style={{ color: '#9ca3af', fontSize: 13 }}>{emptyText}</p> : null;

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ fontWeight: 800, fontSize: 17, color: '#1f2937', marginBottom: 14, paddingLeft: 4 }}>{title}</div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
        {recs.map((rec, i) => <ProductCard key={rec.inventory_id || rec.product_id || i} rec={rec} />)}
      </div>
      <style>{`div::-webkit-scrollbar { display: none }`}</style>
    </div>
  );
}
