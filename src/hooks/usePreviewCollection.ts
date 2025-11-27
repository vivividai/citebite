import { useMutation } from '@tanstack/react-query';
import type { PaperPreview } from '@/lib/search/types';

export interface PreviewCollectionInput {
  name: string;
  keywords?: string;
  useAiAssistant?: boolean;
  naturalLanguageQuery?: string;
  filters?: {
    yearFrom?: number | unknown;
    yearTo?: number | unknown;
    minCitations?: number | unknown;
    openAccessOnly?: boolean;
  };
}

export interface PreviewStats {
  totalPapers: number;
  openAccessPapers: number;
  paywalledPapers: number;
  papersWithEmbeddings: number;
  rerankingApplied: boolean;
}

interface PreviewCollectionResponse {
  success: boolean;
  data: {
    papers: PaperPreview[];
    stats: PreviewStats;
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
