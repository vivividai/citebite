import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface RemovePaperResponse {
  success: boolean;
  message: string;
  data: {
    paperId: string;
    collectionId: string;
  };
}

interface RemovePaperParams {
  collectionId: string;
  paperId: string;
}

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
 * Hook to remove a single paper from a collection
 */
export function useRemovePaper() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      collectionId,
      paperId,
    }: RemovePaperParams): Promise<RemovePaperResponse> => {
      const res = await fetch(
        `/api/collections/${collectionId}/papers/${paperId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new ApiError(
          error.message || 'Failed to remove paper',
          res.status
        );
      }

      return res.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate papers list to refresh the UI
      queryClient.invalidateQueries({
        queryKey: ['collections', variables.collectionId, 'papers'],
      });

      // Also invalidate collection details (paper counts may have changed)
      queryClient.invalidateQueries({
        queryKey: ['collections', variables.collectionId],
      });

      // Invalidate graph data to update visualization
      queryClient.invalidateQueries({
        queryKey: ['collection-graph', variables.collectionId],
      });

      toast.success('Paper removed from collection');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove paper');
    },
  });
}
