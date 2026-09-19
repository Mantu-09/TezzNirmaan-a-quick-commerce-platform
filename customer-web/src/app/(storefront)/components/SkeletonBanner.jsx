// ─────────────────────────────────────────────────────────────
// (storefront)/components/SkeletonBanner.jsx — P13-7
// Banner placeholder during hero image load.
// ─────────────────────────────────────────────────────────────
export default function SkeletonBanner() {
  return (
    <div style={{
      width: '100%',
      height: 200,
      borderRadius: 16,
      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
      backgroundSize: '200% 100%',
      animation: 'sf-shimmer 1.4s infinite',
      marginBottom: 24,
    }} />
  );
}
