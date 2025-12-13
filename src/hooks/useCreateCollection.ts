import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

/**
 * Input for creating a collection with seed papers
 */
export interface CreateCollectionInput {
  name: string;
  researchQuestion: string;
  selectedPaperIds: string[];
}

interface CreateCollectionResponse {
  success: boolean;
  data: {
    collection: {
      id: string;
      name: string;
      naturalLanguageQuery: string;
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
 * Hook to create a new collection with seed papers
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
