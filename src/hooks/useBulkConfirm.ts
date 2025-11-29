/**
 * Bulk Upload Confirm Hook
 * Handles confirming matches and triggering indexing
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface ConfirmMatch {
  fileId: string;
  paperId: string;
}

interface ConfirmInput {
  sessionId: string;
  matches: ConfirmMatch[];
}

interface ConfirmResultDetails {
  success: Array<{ fileId: string; paperId: string; jobId: string | null }>;
  failed: Array<{ fileId: string; paperId: string; error: string }>;
  skipped: Array<{ fileId: string; reason: string }>;
}

interface ConfirmResponse {
  success: boolean;
  sessionId: string;
  results: {
    successCount: number;
    failedCount: number;
    skippedCount: number;
    details: ConfirmResultDetails;
  };
}

export function useBulkConfirm(collectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      matches,
    }: ConfirmInput): Promise<ConfirmResponse> => {
      const response = await fetch(
        `/api/collections/${encodeURIComponent(collectionId)}/bulk-upload/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, matches }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to confirm matches');
      }

      return responseData;
    },
    onSuccess: data => {
      // Invalidate papers query to refresh status
      queryClient.invalidateQueries({ queryKey: ['papers', collectionId] });

      const { successCount, failedCount } = data.results;

      if (successCount > 0 && failedCount === 0) {
        toast.success(`${successCount} PDFs uploaded and queued for indexing!`);
      } else if (successCount > 0 && failedCount > 0) {
        toast.success(`${successCount} PDFs uploaded, ${failedCount} failed`);
      } else if (failedCount > 0) {
        toast.error(`Failed to process ${failedCount} files`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to confirm matches');
    },
  });
}
