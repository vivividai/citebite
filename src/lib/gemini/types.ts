/**
 * Type definitions for Gemini API
 */

/**
 * Gemini API error
 */
export interface GeminiApiError extends Error {
  code?: number;
  status?: string;
  details?: unknown;
}
