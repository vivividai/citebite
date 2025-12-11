import { useQuery } from '@tanstack/react-query';

export interface Collection {
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
  totalPapers: number;
  indexedPapers: number;
}

interface CollectionsResponse {
  success: boolean;
  data: {
    collections: Collection[];
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
 * Hook to fetch user's collections
 */
export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: async (): Promise<Collection[]> => {
      const res = await fetch('/api/collections');

      if (!res.ok) {
        const error = await res.json();
        throw new ApiError(
          error.message || 'Failed to fetch collections',
          res.status
        );
      }

      const data: CollectionsResponse = await res.json();
      return data.data.collections;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}
