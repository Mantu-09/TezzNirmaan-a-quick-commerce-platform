'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:            30 * 1000,   // 30 seconds (dashboard data changes often)
        gcTime:               5 * 60 * 1000,
        retry:                1,
        refetchOnWindowFocus: true,        // refresh when tab re-focused (important for order queue)
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
