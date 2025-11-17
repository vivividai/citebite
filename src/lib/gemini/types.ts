/**
 * Type definitions for Gemini File Search API
 */

/**
 * Metadata for a paper to be indexed in File Search Store
 */
export interface PaperMetadata {
  paper_id: string;
  title: string;
  authors?: string;
  year?: number;
  venue?: string;
}

/**
 * File Search Store configuration
 */
export interface FileSearchStoreConfig {
  displayName: string;
  metadata?: Record<string, string>;
}

/**
 * File Search Store information
 */
export interface FileSearchStore {
  name: string; // Full resource name (e.g., "fileSearchStores/abc123")
  displayName: string;
  createTime: string;
  updateTime: string;
  metadata?: Record<string, string>;
}

/**
 * Upload operation result
 */
export interface UploadOperation {
  name: string; // Operation name for polling
  done: boolean;
  metadata?: {
    state: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
    progress?: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Upload file configuration
 */
export interface UploadFileConfig {
  file: Buffer;
  mimeType: string;
  metadata: PaperMetadata;
}

/**
 * Grounding chunk from File Search results
 */
export interface GroundingChunk {
  document_id: string;
  chunk_id: string;
  relevance_score: number;
}

/**
 * Grounding metadata from Gemini response
 */
export interface GroundingMetadata {
  grounding_chunks: GroundingChunk[];
}

/**
 * Gemini API error
 */
export interface GeminiApiError extends Error {
  code?: number;
  status?: string;
  details?: unknown;
}

/**
 * File upload result
 */
export interface FileUploadResult {
  success: boolean;
  fileId?: string;
  error?: string;
}

/**
 * Store creation result
 */
export interface StoreCreationResult {
  success: boolean;
  storeId?: string;
  storeName?: string;
  error?: string;
}
