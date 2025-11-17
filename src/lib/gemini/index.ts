/**
 * Gemini AI integration module
 *
 * Public exports for Gemini File Search API functionality
 */

// Client
export {
  getGeminiClient,
  resetGeminiClient,
  isGeminiConfigured,
  withGeminiErrorHandling,
} from './client';

// File Search Store management
export {
  createFileSearchStore,
  uploadPdfToStore,
  getFileSearchStore,
  deleteFileSearchStore,
  withRetry,
} from './fileSearch';

// Types
export type {
  PaperMetadata,
  FileSearchStoreConfig,
  FileSearchStore,
  UploadOperation,
  UploadFileConfig,
  GroundingChunk,
  GroundingMetadata,
  GeminiApiError,
  FileUploadResult,
  StoreCreationResult,
} from './types';
