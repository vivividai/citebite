import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/database.types';

/**
 * Creates a Supabase client for use in Client Components
 *
 * This client:
 * - Uses browser-side cookies for session management
 * - Should only be used in 'use client' components
 * - Automatically handles authentication state
 *
 * @returns Typed Supabase client for browser usage
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
