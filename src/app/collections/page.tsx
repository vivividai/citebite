import { redirect } from 'next/navigation';

/**
 * Legacy collections page - redirects to new dashboard
 */
export default function CollectionsPage() {
  redirect('/dashboard');
}
