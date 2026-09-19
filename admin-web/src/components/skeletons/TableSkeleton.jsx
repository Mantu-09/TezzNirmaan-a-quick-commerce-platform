// dashboard/src/components/skeletons/TableSkeleton.jsx — P4-2C
//
// Reusable table skeleton for wrapping inside <Suspense fallback={...}>.
// Matches the visual style of the admin/dashboard table layouts.
//
// Usage:
//   import { Suspense } from 'react';
//   import { TableSkeleton } from '@/components/skeletons';
//
//   <Suspense fallback={<TableSkeleton rows={10} />}>
//     <OrdersTable shopId={shopId} filters={filters} />
//   </Suspense>

/**
 * @param {{ rows?: number, cols?: number, showHeader?: boolean }} props
 */
export default function TableSkeleton({ rows = 8, cols = 5, showHeader = true }) {
  const rowsArr = Array.from({ length: rows });
  // Vary column widths to look natural
  const colWidths = [
    ['60%', '70%', '80%'],
    ['40%', '55%', '45%'],
    ['50%', '60%', '50%'],
    ['30%', '40%', '35%'],
    ['40px', '50px', '40px'],
  ];

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden',
    }}>
      {showHeader && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 16, padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 12,
                width: colWidths[i % colWidths.length][0],
                borderRadius: 4,
                background: 'var(--surface)',
                animation: 'sk-pulse 1.4s ease infinite',
              }}
            />
          ))}
        </div>
      )}

      {rowsArr.map((_, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 16, padding: '14px 20px',
            borderBottom: rowIdx < rows - 1 ? '1px solid var(--border)' : 'none',
            animation: 'sk-pulse 1.4s ease infinite',
            animationDelay: `${rowIdx * 50}ms`,
          }}
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <div
              key={colIdx}
              style={{
                height: 14,
                width: colWidths[colIdx % colWidths.length][rowIdx % 3],
                borderRadius: 4,
                background: 'var(--surface-2)',
              }}
            />
          ))}
        </div>
      ))}

      <style>{`
        @keyframes sk-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
