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

// Chat functions
export { queryWithFileSearch } from './chat';
export type { ConversationMessage, ChatResponse } from './chat';

// Query transformation pipeline
export { queryWithTransform } from './query-with-transform';
export { transformQuery } from './query-transform';
export type { QueryTransformResult } from './query-transform';
export { expandQueryForReranking } from './query-expand';
export type { QueryExpansionResult } from './query-expand';
export { executeParallelQueries, hasEnoughResults } from './parallel-rag';
export type { SubQueryResult } from './parallel-rag';
export { synthesizeResponses, getBestSubQueryAnswer } from './synthesis';

// Prompts (for customization/testing)
export {
  CITATION_SYSTEM_PROMPT,
  RETRY_CONFIG,
  FALLBACK_PROMPTS,
  buildCitationAwarePrompt,
} from './prompts';

// Grounding validation
export { validateGroundingMetadata } from './grounding-validator';
export type { ValidationResult } from './grounding-validator';

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
