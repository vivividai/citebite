import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Navigation } from '@/components/layout/navigation';

interface LandingLayoutProps {
  children: React.ReactNode;
}

export default async function LandingLayout({ children }: LandingLayoutProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <Navigation user={user} />
      <main className="min-h-screen">{children}</main>
    </>
  );
}
