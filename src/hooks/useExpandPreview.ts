import { useMutation } from '@tanstack/react-query';
import type { PaperPreview } from '@/lib/search/types';

export interface ExpandPreviewParams {
  collectionId: string;
  paperId: string;
  type: 'references' | 'citations' | 'both';
  influentialOnly?: boolean;
  maxPapers?: number;
}

export interface ExpandPreviewStats {
  totalFound: number;
  referencesCount: number;
  citationsCount: number;
  papersWithEmbeddings: number;
  alreadyInCollection: number;
  rerankingApplied: boolean;
}

interface ExpandPreviewResponse {
  success: boolean;
  data: {
    papers: PaperPreview[];
    stats: ExpandPreviewStats;
    sourceQuery: string;
  };
}

/**
 * Hook to preview papers for collection expansion (references/citations)
 */
export function useExpandPreview() {
  return useMutation({
    mutationFn: async (
      params: ExpandPreviewParams
    ): Promise<ExpandPreviewResponse> => {
      const { collectionId, paperId, type, influentialOnly, maxPapers } =
        params;

      const res = await fetch(
        `/api/collections/${collectionId}/expand/preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paperId,
            type,
            influentialOnly,
            maxPapers,
          }),
        }
      );

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(
          responseData.error ||
            responseData.message ||
            'Failed to preview expand'
        );
      }

      return responseData;
    },
  });
}
