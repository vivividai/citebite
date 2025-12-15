import { Suspense } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardClient } from './DashboardClient';

/**
 * Dashboard page - Server component wrapper
 * Fetches user data and renders client component
 */
export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardClient user={user} />
    </Suspense>
  );
}

/**
 * Loading skeleton for dashboard
 */
function DashboardSkeleton() {
  return (
    <div className="h-screen w-full grid grid-cols-[60px_220px_1fr_400px] animate-pulse">
      <div className="bg-[hsl(var(--rail))]" />
      <div className="bg-[hsl(var(--sidebar))] border-r" />
      <div className="bg-background" />
      <div className="bg-card border-l" />
    </div>
  );
}
