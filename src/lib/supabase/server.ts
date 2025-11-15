import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/types/database.types';

/**
 * Creates a Supabase client for use in Server Components and API Routes
 *
 * This client:
 * - Uses server-side cookies for session management
 * - Should be used in Server Components, API routes, and Server Actions
 * - Provides read/write access to cookies for auth state
 *
 * @returns Typed Supabase client for server usage
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase admin client with service role key
 *
 * IMPORTANT: This client bypasses Row Level Security (RLS)
 * - Only use for admin operations that require full access
 * - Never expose this client to the frontend
 * - Use with caution to avoid security vulnerabilities
 *
 * @returns Typed Supabase client with admin privileges
 */
export function createAdminSupabaseClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Admin client doesn't need cookie management
        },
      },
    }
  );
}
