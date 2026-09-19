// ─────────────────────────────────────────────────────────────
// (storefront)/components/SkeletonCard.jsx — P13-7
// Pulsing placeholder for ProductCard during data loading.
// ─────────────────────────────────────────────────────────────
export default function SkeletonCard() {
  return (
    <div className="sf-product-card" style={{ pointerEvents: 'none' }}>
      <div style={{
        aspectRatio: '1 / 1',
        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'sf-shimmer 1.4s infinite',
        borderRadius: 10,
        marginBottom: 10,
      }} />
      <div style={{ height: 14, width: '80%', background: '#f0f0f0', borderRadius: 6, marginBottom: 6, animation: 'sf-shimmer 1.4s infinite' }} />
      <div style={{ height: 12, width: '50%', background: '#f0f0f0', borderRadius: 6, marginBottom: 10, animation: 'sf-shimmer 1.4s infinite' }} />
      <div style={{ height: 32, background: '#f0f0f0', borderRadius: 8, animation: 'sf-shimmer 1.4s infinite' }} />
    </div>
  );
}

export function SkeletonGrid({ count = 8 }) {
  return (
    <div className="sf-product-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
