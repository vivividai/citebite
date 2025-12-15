import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Dashboard layout - Server component for auth check
 * Redirects non-authenticated users to login
 */
export default async function DashboardRootLayout({
  children,
}: DashboardLayoutProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <>{children}</>;
}
