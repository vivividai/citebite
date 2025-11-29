/**
 * Hook for uploading PDF files to papers
 * Used for manual PDF upload when automatic download fails
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface UploadPdfInput {
  paperId: string;
  file: File;
}

interface UploadPdfResponse {
  success: boolean;
  data: {
    paperId: string;
    storagePath: string;
    jobId: string | null;
    message: string;
  };
}

export function useUploadPdf(collectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      paperId,
      file,
    }: UploadPdfInput): Promise<UploadPdfResponse> => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `/api/papers/${encodeURIComponent(paperId)}/upload?collectionId=${encodeURIComponent(collectionId)}`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to upload PDF');
      }

      return responseData;
    },
    onSuccess: () => {
      // Invalidate papers query to refetch and show updated status
      queryClient.invalidateQueries({ queryKey: ['papers', collectionId] });

      toast.success('PDF uploaded successfully. Indexing has started.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload PDF');
    },
  });
}
