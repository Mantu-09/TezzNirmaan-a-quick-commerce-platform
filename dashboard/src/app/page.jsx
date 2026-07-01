import { redirect } from 'next/navigation';

// Root page — middleware handles the actual redirect based on role.
// This is a fallback.
export default function RootPage() {
  redirect('/dashboard/orders');
}
