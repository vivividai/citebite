import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface DeleteResult {
  paperId: string;
  success: boolean;
  error?: string;
}

interface BatchRemoveResponse {
  success: boolean;
  message: string;
  data: {
    collectionId: string;
    results: DeleteResult[];
    summary: {
      total: number;
      succeeded: number;
      failed: number;
    };
  };
}

interface BatchRemoveParams {
  collectionId: string;
  paperIds: string[];
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
 * Hook to remove multiple papers from a collection
 */
export function useBatchRemovePapers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      collectionId,
      paperIds,
    }: BatchRemoveParams): Promise<BatchRemoveResponse> => {
      const res = await fetch(
        `/api/collections/${collectionId}/papers/batch-delete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ paperIds }),
        }
      );

      const data = await res.json();

      // 207 Multi-Status means partial success - we still want to process it
      if (!res.ok && res.status !== 207) {
        throw new ApiError(
          data.message || 'Failed to remove papers',
          res.status
        );
      }

      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate papers list to refresh the UI
      queryClient.invalidateQueries({
        queryKey: ['collections', variables.collectionId, 'papers'],
      });

      // Also invalidate collection details
      queryClient.invalidateQueries({
        queryKey: ['collections', variables.collectionId],
      });

      // Invalidate graph data to update visualization
      queryClient.invalidateQueries({
        queryKey: ['collection-graph', variables.collectionId],
      });

      const { summary } = data.data;

      if (summary.failed === 0) {
        toast.success(`Removed ${summary.succeeded} papers from collection`);
      } else if (summary.succeeded === 0) {
        toast.error(`Failed to remove papers`);
      } else {
        toast.success(
          `Removed ${summary.succeeded} papers (${summary.failed} failed)`
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove papers');
    },
  });
}
