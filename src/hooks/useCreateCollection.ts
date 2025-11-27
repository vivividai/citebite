import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export interface CreateCollectionInput {
  name: string;
  keywords?: string;
  useAiAssistant?: boolean;
  naturalLanguageQuery?: string;
  selectedPaperIds?: string[];
  filters?: {
    yearFrom?: number | unknown;
    yearTo?: number | unknown;
    minCitations?: number | unknown;
    openAccessOnly?: boolean;
  };
}

interface CreateCollectionResponse {
  success: boolean;
  data: {
    collection: {
      id: string;
      name: string;
      searchQuery: string;
      filters: Record<string, unknown> | null;
      fileSearchStoreId: string | null;
      createdAt: string;
    };
    stats: {
      totalPapers: number;
      openAccessPapers: number;
      queuedDownloads: number;
      failedToQueue: number;
    };
  };
}

/**
 * Hook to create a new collection
 */
export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: CreateCollectionInput
    ): Promise<CreateCollectionResponse> => {
      const res = await fetch('/api/collections', {
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
            'Failed to create collection'
        );
      }

      return responseData;
    },
    onSuccess: data => {
      // Invalidate collections query to refetch the list
      queryClient.invalidateQueries({ queryKey: ['collections'] });

      // Show success toast
      toast.success(
        `Collection "${data.data.collection.name}" created with ${data.data.stats.totalPapers} papers!`
      );
    },
    onError: (error: Error) => {
      // Show error toast
      toast.error(error.message || 'Failed to create collection');
    },
  });
}
