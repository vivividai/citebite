/**
 * Gemini AI integration module
 *
 * Public exports for Gemini API functionality
 */

// Client
export {
  getGeminiClient,
  resetGeminiClient,
  isGeminiConfigured,
  withGeminiErrorHandling,
} from './client';

// Query expansion
export { expandQueryForReranking } from './query-expand';
export type { QueryExpansionResult } from './query-expand';

// Keyword extraction
export { extractKeywords } from './keyword-extraction';

// Types
export type { GeminiApiError } from './types';
