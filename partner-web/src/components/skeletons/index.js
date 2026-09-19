// dashboard/src/components/skeletons/index.js — P4-2C
// Barrel export for all skeleton components.
//
// Import as:
//   import { TableSkeleton } from '@/components/skeletons';
//
// Usage with Suspense:
//   import { Suspense } from 'react';
//   import { TableSkeleton } from '@/components/skeletons';
//
//   <Suspense fallback={<TableSkeleton rows={10} />}>
//     <OrdersTable shopId={shopId} filters={filters} />
//   </Suspense>

export { default as TableSkeleton } from './TableSkeleton';
