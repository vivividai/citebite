import { redirect } from 'next/navigation';

interface CollectionDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Legacy collection detail page - redirects to new dashboard with collection ID
 */
export default async function CollectionDetailPage({
  params,
}: CollectionDetailPageProps) {
  const { id } = await params;
  redirect(`/dashboard?collection=${id}`);
}
