import { useQuery } from '@tanstack/react-query';

export interface Paper {
  paper_id: string;
  title: string;
  authors: Array<{ name: string; authorId?: string }> | null;
  year: number | null;
  abstract: string | null;
  citation_count: number | null;
  venue: string | null;
  open_access_pdf_url: string | null;
  pdf_source: string | null;
  vector_status: string | null;
  created_at: string | null;
  uploaded_by: string | null;
  /** Degree of the paper (0=search, 1-3=expansion levels) */
  degree: number;
}

interface PapersResponse {
  success: boolean;
  data: {
    papers: Paper[];
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
 * Hook to fetch papers for a specific collection
 */
export function useCollectionPapers(collectionId: string) {
  return useQuery({
    queryKey: ['collections', collectionId, 'papers'],
    queryFn: async (): Promise<Paper[]> => {
      const res = await fetch(`/api/collections/${collectionId}/papers`);

      if (!res.ok) {
        const error = await res.json();
        throw new ApiError(
          error.message || 'Failed to fetch papers',
          res.status
        );
      }

      const data: PapersResponse = await res.json();
      return data.data.papers;
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!collectionId, // Only run query if collectionId is provided
  });
}
