import { useMutation } from '@tanstack/react-query';

export interface PreviewCollectionInput {
  name: string;
  keywords: string;
  filters?: {
    yearFrom?: number;
    yearTo?: number;
    minCitations?: number;
    openAccessOnly?: boolean;
  };
}

interface PreviewCollectionResponse {
  success: boolean;
  data: {
    totalPapers: number;
    openAccessPapers: number;
    paywalledPapers: number;
    searchQuery: string;
    filters: Record<string, unknown> | null;
  };
}

/**
 * Hook to preview collection before creating
 */
export function usePreviewCollection() {
  return useMutation({
    mutationFn: async (
      data: PreviewCollectionInput
    ): Promise<PreviewCollectionResponse> => {
      const res = await fetch('/api/collections/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(
          responseData.error ||
            responseData.message ||
            'Failed to preview collection'
        );
      }

      return responseData;
    },
  });
}
