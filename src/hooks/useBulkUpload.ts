/**
 * Bulk Upload Hook
 * Handles uploading multiple PDF files for bulk matching
 */

import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export interface MatchResult {
  paperId: string | null;
  paperTitle: string | null;
  confidence: 'high' | 'medium' | 'none';
  matchMethod: string;
  score?: number;
}

export interface ExtractedMetadata {
  doi?: string;
  arxivId?: string;
  title?: string;
  extractionMethod: string;
}

export interface BulkUploadResult {
  fileId: string;
  filename: string;
  tempStorageKey: string;
  match: MatchResult;
  extractedMetadata: ExtractedMetadata;
}

export interface BulkUploadResponse {
  sessionId: string;
  results: BulkUploadResult[];
  unmatchedPapers: Array<{ paperId: string; title: string }>;
  errors: Array<{ filename: string; error: string }>;
}

interface BulkUploadInput {
  files: File[];
  onProgress?: (uploaded: number, total: number) => void;
}

export function useBulkUpload(collectionId: string) {
  return useMutation({
    mutationFn: async ({
      files,
      onProgress,
    }: BulkUploadInput): Promise<BulkUploadResponse> => {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      // Track upload progress if callback provided
      if (onProgress) {
        onProgress(0, files.length);
      }

      const response = await fetch(
        `/api/collections/${encodeURIComponent(collectionId)}/bulk-upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to upload files');
      }

      if (onProgress) {
        onProgress(files.length, files.length);
      }

      return responseData;
    },
    onSuccess: data => {
      const successCount = data.results.length;
      const errorCount = data.errors.length;

      if (successCount > 0 && errorCount === 0) {
        toast.success(`${successCount} files uploaded and matched`);
      } else if (successCount > 0 && errorCount > 0) {
        toast.success(`${successCount} files uploaded, ${errorCount} failed`);
      } else if (errorCount > 0) {
        toast.error(`Failed to upload ${errorCount} files`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload files');
    },
  });
}
