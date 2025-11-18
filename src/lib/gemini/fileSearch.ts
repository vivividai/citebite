/**
 * Gemini File Search Store management functions
 *
 * Provides functions to create, manage, and interact with File Search Stores
 * for RAG (Retrieval-Augmented Generation) capabilities.
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';
import {
  PaperMetadata,
  StoreCreationResult,
  FileUploadResult,
  GeminiApiError,
} from './types';

/**
 * Default delay between polling attempts (in milliseconds)
 */
const POLLING_INTERVAL_MS = 5000; // 5 seconds

/**
 * Maximum polling attempts before timeout
 */
const MAX_POLLING_ATTEMPTS = 60; // 5 minutes total

/**
 * Create a new File Search Store for a collection
 *
 * @param collectionId - The collection ID to associate with the store
 * @param displayName - Optional custom display name (defaults to collection_{collectionId})
 * @returns Promise with creation result containing store ID
 *
 * @example
 * ```typescript
 * const result = await createFileSearchStore('collection_123');
 * if (result.success) {
 *   console.log('Store created:', result.storeId);
 * }
 * ```
 */
export async function createFileSearchStore(
  collectionId: string,
  displayName?: string
): Promise<StoreCreationResult> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();
    const storeName = displayName || `collection_${collectionId}`;

    try {
      // Create File Search Store
      const store = await client.fileSearchStores.create({
        config: {
          displayName: storeName,
        },
      });

      // Extract store ID from the resource name
      // Resource name format: "fileSearchStores/{storeId}"
      const storeId = store.name?.split('/').pop();

      return {
        success: true,
        storeId,
        storeName: store.displayName,
      };
    } catch (error) {
      const err = error as GeminiApiError;
      return {
        success: false,
        error: err.message || 'Failed to create File Search Store',
      };
    }
  });
}

/**
 * Upload a PDF file to a File Search Store
 *
 * @param storeId - The File Search Store ID
 * @param pdfBuffer - PDF file as a Buffer
 * @param metadata - Paper metadata to associate with the file
 * @returns Promise with upload result
 *
 * @example
 * ```typescript
 * const result = await uploadPdfToStore(
 *   'store_123',
 *   pdfBuffer,
 *   { paper_id: 'abc', title: 'My Paper', authors: 'John Doe', year: 2024 }
 * );
 * ```
 */
export async function uploadPdfToStore(
  storeId: string,
  pdfBuffer: Buffer,
  metadata: PaperMetadata
): Promise<FileUploadResult> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    try {
      // Convert Buffer to Blob for the API
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });

      // Upload file to the store
      const operation = await client.fileSearchStores.uploadToFileSearchStore({
        fileSearchStoreName: `fileSearchStores/${storeId}`,
        file: blob,
        config: {
          mimeType: 'application/pdf',
          displayName: metadata.title,
          customMetadata: [
            { key: 'paper_id', stringValue: metadata.paper_id },
            { key: 'title', stringValue: metadata.title },
            ...(metadata.authors
              ? [{ key: 'authors', stringValue: metadata.authors }]
              : []),
            ...(metadata.year
              ? [{ key: 'year', stringValue: metadata.year.toString() }]
              : []),
            ...(metadata.venue
              ? [{ key: 'venue', stringValue: metadata.venue }]
              : []),
          ],
        },
      });

      // Validate operation object
      if (!operation || typeof operation !== 'object') {
        throw new Error(
          `Invalid operation response from Gemini API: ${JSON.stringify(operation)}`
        );
      }

      // Check if operation is already completed (has response field)
      // Some operations complete immediately and return response directly
      if (operation.response && operation.response.documentName) {
        console.log('[Gemini] Operation completed immediately');
        const fileId = operation.response.documentName.split('/').pop();
        return {
          success: true,
          fileId,
        };
      }

      // If operation has a name but no response, poll for completion
      // Note: operations.get() in @google/genai v1.29.1 has issues
      // For now, we'll treat operations with response as complete
      if (!operation.response && operation.name) {
        console.warn(
          '[Gemini] Operation requires polling, but operations.get() is not reliable in SDK v1.29.1'
        );
        console.warn('[Gemini] Attempting polling anyway...');
        const result = await pollOperation(operation, client);
        if (result.success) {
          return {
            success: true,
            fileId: result.fileId,
          };
        } else {
          return {
            success: false,
            error: result.error || 'Polling failed',
          };
        }
      }

      // Fallback: try polling
      const result = await pollOperation(operation, client);

      if (result.success) {
        return {
          success: true,
          fileId: result.fileId,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Upload operation failed',
        };
      }
    } catch (error) {
      const err = error as GeminiApiError;

      // Handle specific error cases
      if (
        err.message?.includes('quota') ||
        err.message?.includes('rate limit')
      ) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        };
      }

      if (err.message?.includes('size') || err.message?.includes('too large')) {
        return {
          success: false,
          error: 'File size exceeds maximum limit (100MB).',
        };
      }

      return {
        success: false,
        error: err.message || 'Failed to upload PDF to File Search Store',
      };
    }
  });
}

/**
 * Get File Search Store information
 *
 * @param storeId - The File Search Store ID
 * @returns Promise with store information or null if not found
 */
export async function getFileSearchStore(storeId: string): Promise<{
  name: string;
  displayName?: string;
  metadata?: Record<string, string>;
} | null> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    try {
      const store = await client.fileSearchStores.get({
        name: `fileSearchStores/${storeId}`,
      });
      return {
        name: store.name || '',
        displayName: store.displayName,
        metadata: store.customMetadata
          ? convertCustomMetadataToRecord(store.customMetadata)
          : undefined,
      };
    } catch (error) {
      const err = error as GeminiApiError;
      console.error('Failed to get File Search Store:', err.message);
      return null;
    }
  });
}

/**
 * Delete a File Search Store
 *
 * @param storeId - The File Search Store ID
 * @returns Promise that resolves to true if deletion was successful
 */
export async function deleteFileSearchStore(storeId: string): Promise<boolean> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    try {
      await client.fileSearchStores.delete({
        name: `fileSearchStores/${storeId}`,
      });
      return true;
    } catch (error) {
      const err = error as GeminiApiError;
      console.error('Failed to delete File Search Store:', err.message);
      return false;
    }
  });
}

/**
 * Poll an async operation until completion
 *
 * @param operation - The operation to poll
 * @param client - The Gemini client instance
 * @returns Promise with operation result
 */
async function pollOperation(
  operation: {
    name?: string;
    done?: boolean;
    error?: { message?: string };
    response?: { documentId?: string; name?: string };
  },
  client: ReturnType<typeof getGeminiClient>
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  let attempts = 0;

  // Validate operation has a name
  if (!operation.name) {
    return {
      success: false,
      error: `Operation missing 'name' field. Response: ${JSON.stringify(operation)}`,
    };
  }

  // If operation is already done, return immediately
  if (operation.done) {
    if (operation.error) {
      return {
        success: false,
        error: operation.error.message || 'Operation failed',
      };
    }

    const fileId =
      operation.response?.documentId ||
      operation.response?.name?.split('/').pop();
    return {
      success: true,
      fileId,
    };
  }

  // Otherwise, poll until done
  while (attempts < MAX_POLLING_ATTEMPTS) {
    try {
      const updatedOperation = await client.operations.get({
        name: operation.name,
      });

      // Check if operation is complete
      if (updatedOperation.done) {
        if (updatedOperation.error) {
          return {
            success: false,
            error: updatedOperation.error.message || 'Operation failed',
          };
        }

        // Extract file ID from response
        const fileId =
          updatedOperation.response?.documentId ||
          updatedOperation.response?.name?.split('/').pop();

        return {
          success: true,
          fileId,
        };
      }

      // Wait before polling again
      await sleep(POLLING_INTERVAL_MS);
      attempts++;
    } catch (error) {
      const err = error as GeminiApiError;
      return {
        success: false,
        error: err.message || 'Failed to poll operation status',
      };
    }
  }

  // Timeout
  return {
    success: false,
    error: `Operation timeout after ${(MAX_POLLING_ATTEMPTS * POLLING_INTERVAL_MS) / 1000} seconds`,
  };
}

/**
 * Convert custom metadata array to a record object
 *
 * @param customMetadata - Custom metadata array
 * @returns Record object
 */
function convertCustomMetadataToRecord(
  customMetadata: Array<{ key?: string; stringValue?: string }>
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const item of customMetadata) {
    if (item.key && item.stringValue) {
      record[item.key] = item.stringValue;
    }
  }
  return record;
}

/**
 * Sleep utility for polling
 *
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @returns Promise with the function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if it's a rate limit error
      const isRateLimit =
        lastError.message?.includes('quota') ||
        lastError.message?.includes('rate limit') ||
        (lastError as GeminiApiError).code === 429;

      if (!isRateLimit || i === maxRetries - 1) {
        throw lastError;
      }

      // Exponential backoff
      const delay = initialDelayMs * Math.pow(2, i);
      console.log(
        `Rate limit hit, retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})`
      );
      await sleep(delay);
    }
  }

  throw lastError!;
}
