import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Navigation } from '@/components/layout/navigation';

interface WithNavLayoutProps {
  children: React.ReactNode;
}

export default async function WithNavLayout({ children }: WithNavLayoutProps) {
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
