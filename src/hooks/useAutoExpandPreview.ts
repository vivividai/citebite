import { useMutation } from '@tanstack/react-query';
import type { PaperPreview } from '@/lib/search/types';
import type { AutoExpandPreviewInput } from '@/lib/validations/auto-expand';

interface AutoExpandPreviewResponse {
  success: boolean;
  data: {
    papers: PaperPreview[];
    stats: {
      degree1Count: number;
      degree2Count: number;
      degree3Count: number;
      totalCount: number;
    };
  };
}

/**
 * Hook to fetch auto-expand preview papers
 */
export function useAutoExpandPreview(collectionId: string) {
  return useMutation({
    mutationFn: async (
      input: AutoExpandPreviewInput
    ): Promise<AutoExpandPreviewResponse> => {
      const response = await fetch(
        `/api/collections/${collectionId}/auto-expand/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch auto-expand preview');
      }

      return response.json();
    },
  });
}
