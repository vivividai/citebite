import { useQuery } from '@tanstack/react-query';

export interface CollectionDetail {
  id: string;
  name: string;
  search_query: string;
  filters: {
    yearFrom?: number;
    yearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
  } | null;
  created_at: string;
  file_search_store_id: string | null;
  user_id: string;
  is_public: boolean | null;
  insight_summary: unknown | null;
  last_updated_at: string | null;
  copy_count: number | null;
  totalPapers: number;
  indexedPapers: number;
  failedPapers: number;
}

interface CollectionResponse {
  success: boolean;
  data: {
    collection: CollectionDetail;
  };
}

// Custom error class to track status codes
class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Hook to fetch a single collection by ID
 */
export function useCollection(collectionId: string) {
  return useQuery({
    queryKey: ['collections', collectionId],
    queryFn: async (): Promise<CollectionDetail> => {
      const res = await fetch(`/api/collections/${collectionId}`);

      if (!res.ok) {
        const error = await res.json();
        throw new ApiError(
          error.message || 'Failed to fetch collection',
          res.status
        );
      }

      const data: CollectionResponse = await res.json();
      return data.data.collection;
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!collectionId, // Only run query if collectionId is provided
  });
}
