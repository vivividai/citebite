import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export interface ExpandCollectionParams {
  collectionId: string;
  selectedPaperIds: string[];
}

interface ExpandCollectionResponse {
  success: boolean;
  data: {
    addedCount: number;
    openAccessCount: number;
    queuedDownloads?: number;
    message: string;
  };
}

/**
 * Hook to expand a collection with selected papers
 */
export function useExpandCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      params: ExpandCollectionParams
    ): Promise<ExpandCollectionResponse> => {
      const { collectionId, selectedPaperIds } = params;

      const res = await fetch(`/api/collections/${collectionId}/expand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedPaperIds,
        }),
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(
          responseData.error ||
            responseData.message ||
            'Failed to expand collection'
        );
      }

      return responseData;
    },
    onSuccess: (data, { collectionId }) => {
      // Invalidate collection papers query to refresh the list
      queryClient.invalidateQueries({
        queryKey: ['collection-papers', collectionId],
      });
      // Also invalidate the collection details
      queryClient.invalidateQueries({
        queryKey: ['collection', collectionId],
      });
      // Invalidate collections list for paper counts
      queryClient.invalidateQueries({
        queryKey: ['collections'],
      });

      toast.success(data.data.message);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to expand collection');
    },
  });
}
