import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface DeleteCollectionResponse {
  success: boolean;
  message: string;
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
 * Hook to delete a collection
 */
export function useDeleteCollection() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (
      collectionId: string
    ): Promise<DeleteCollectionResponse> => {
      const res = await fetch(`/api/collections/${collectionId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new ApiError(
          error.message || 'Failed to delete collection',
          res.status
        );
      }

      return res.json();
    },
    onSuccess: () => {
      // Invalidate collections list to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['collections'] });

      // Show success message
      toast.success('Collection deleted successfully');

      // Redirect to collections list
      router.push('/');
    },
    onError: (error: Error) => {
      // Show error message
      toast.error(error.message || 'Failed to delete collection');
    },
  });
}
