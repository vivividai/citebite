import { useQuery } from '@tanstack/react-query';
import type { GraphData, GraphApiResponse } from '@/types/graph';

/**
 * Fetch graph data for a collection
 */
async function fetchGraphData(collectionId: string): Promise<GraphData> {
  const res = await fetch(`/api/collections/${collectionId}/graph`);
  const data: GraphApiResponse = await res.json();

  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || 'Failed to fetch graph data'
    );
  }

  return data.data;
}

/**
 * Hook to fetch and cache collection graph data
 */
export function useCollectionGraph(collectionId: string) {
  return useQuery({
    queryKey: ['collection-graph', collectionId],
    queryFn: () => fetchGraphData(collectionId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
