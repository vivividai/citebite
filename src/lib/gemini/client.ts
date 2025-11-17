/**
 * Gemini AI client initialization
 *
 * Singleton pattern to ensure single instance across the application
 */

import { GoogleGenAI } from '@google/genai';
import { GeminiApiError } from './types';

let geminiClient: GoogleGenAI | null = null;

/**
 * Get or create Gemini AI client instance
 *
 * @returns GoogleGenAI client instance
 * @throws {GeminiApiError} If API key is not configured
 */
export function getGeminiClient(): GoogleGenAI {
  if (geminiClient) {
    return geminiClient;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error(
      'GEMINI_API_KEY is not configured in environment variables'
    ) as GeminiApiError;
    error.code = 500;
    error.status = 'CONFIGURATION_ERROR';
    throw error;
  }

  geminiClient = new GoogleGenAI({ apiKey });
  return geminiClient;
}

/**
 * Reset the Gemini client instance (useful for testing)
 */
export function resetGeminiClient(): void {
  geminiClient = null;
}

/**
 * Check if Gemini client is configured
 *
 * @returns true if API key is available, false otherwise
 */
export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * Wrapper for Gemini API calls with error handling
 *
 * @param fn - Async function to execute
 * @returns Promise with the result
 * @throws {GeminiApiError} Enhanced error with additional context
 */
export async function withGeminiErrorHandling<T>(
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Enhance error with additional context
    const geminiError = error as GeminiApiError;

    // Add common error context
    if (!geminiError.code) {
      geminiError.code = 500;
    }

    // Log error for debugging (in production, use proper logging service)
    console.error('Gemini API Error:', {
      message: geminiError.message,
      code: geminiError.code,
      status: geminiError.status,
      details: geminiError.details,
    });

    throw geminiError;
  }
}
