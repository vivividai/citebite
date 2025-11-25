/**
 * Gemini chat functions with File Search integration for RAG
 *
 * Provides functions to query Gemini with File Search tool for
 * citation-backed AI conversations with research papers.
 *
 * Features:
 * - System prompt for citation-focused responses
 * - Low temperature for deterministic, citation-heavy output
 * - Automatic retry when grounding metadata is missing
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';
import { GeminiApiError } from './types';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';
import {
  CITATION_SYSTEM_PROMPT,
  RETRY_CONFIG,
  FALLBACK_PROMPTS,
  buildCitationAwarePrompt,
} from './prompts';
import { validateGroundingMetadata } from './grounding-validator';

/**
 * Conversation message format
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Chat response with grounding metadata
 */
export interface ChatResponse {
  answer: string;
  groundingChunks: GroundingChunk[];
  groundingSupports: GroundingSupport[];
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Query Gemini with File Search tool for RAG-based chat
 *
 * Includes automatic retry logic when grounding metadata is missing.
 *
 * @param fileSearchStoreId - The File Search Store ID containing indexed papers
 * @param userQuestion - The user's question
 * @param conversationHistory - Previous messages in the conversation (last 5-10 messages)
 * @returns Promise with AI answer and cited papers
 *
 * @example
 * ```typescript
 * const response = await queryWithFileSearch(
 *   'store_123',
 *   'What are the main findings about attention mechanisms?',
 *   [
 *     { role: 'user', content: 'Tell me about transformers' },
 *     { role: 'assistant', content: 'Transformers are...' }
 *   ]
 * );
 * ```
 */
export async function queryWithFileSearch(
  fileSearchStoreId: string,
  userQuestion: string,
  conversationHistory: ConversationMessage[] = []
): Promise<ChatResponse> {
  return queryWithRetry(
    fileSearchStoreId,
    userQuestion,
    conversationHistory,
    0
  );
}

/**
 * Internal function that handles retry logic for missing grounding metadata
 */
async function queryWithRetry(
  fileSearchStoreId: string,
  userQuestion: string,
  conversationHistory: ConversationMessage[],
  retryCount: number
): Promise<ChatResponse> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    try {
      // Build prompt based on retry count
      let prompt: string;
      if (retryCount === 0) {
        // Initial query with citation-aware prompt
        prompt = buildCitationAwarePrompt(userQuestion);
      } else if (retryCount === 1) {
        // First retry: add explicit citation instruction
        prompt = FALLBACK_PROMPTS.retry1(userQuestion);
      } else {
        // Second retry: reframe as explicit grounding request
        prompt = FALLBACK_PROMPTS.retry2(userQuestion);
      }

      // Build content array with conversation history + new question
      // Note: Gemini uses 'model' role instead of 'assistant'
      const contents = [
        ...conversationHistory.map(msg => ({
          role:
            msg.role === 'assistant' ? ('model' as const) : ('user' as const),
          parts: [{ text: msg.content }],
        })),
        {
          role: 'user' as const,
          parts: [{ text: prompt }],
        },
      ];

      // Call Gemini with File Search tool
      // Based on official documentation: https://ai.google.dev/gemini-api/docs/file-search
      console.log(`[Gemini Chat] File Search Store ID: ${fileSearchStoreId}`);
      console.log(
        `[Gemini Chat] File Search Store Name: fileSearchStores/${fileSearchStoreId}`
      );
      if (retryCount > 0) {
        console.log(
          `[Gemini Chat] Retry attempt ${retryCount}/${RETRY_CONFIG.maxRetries}`
        );
      }

      const requestConfig = {
        model: 'gemini-2.5-flash',
        contents,
        config: {
          // System instruction for citation-focused responses
          systemInstruction: CITATION_SYSTEM_PROMPT,
          // Lower temperature for more deterministic, citation-heavy output
          temperature: 0.2,
          tools: [
            {
              fileSearch: {
                fileSearchStoreNames: [`fileSearchStores/${fileSearchStoreId}`],
              },
            },
          ],
        },
      };

      console.log(
        '[Gemini Chat] Request config:',
        JSON.stringify(
          {
            ...requestConfig,
            config: {
              ...requestConfig.config,
              // Truncate system instruction for logging
              systemInstruction:
                requestConfig.config.systemInstruction.substring(0, 100) +
                '...',
            },
          },
          null,
          2
        )
      );

      const response = await client.models.generateContent(requestConfig);

      // Log response summary (not full response in production)
      console.log('[Gemini Chat] Response received');

      // Extract answer text
      const answer =
        response.candidates?.[0]?.content?.parts?.[0]?.text ||
        'No answer generated';

      // Extract grounding metadata for citations
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

      // Extract grounding data (chunks and supports)
      const { chunks, supports } = extractGroundingData(groundingMetadata);

      console.log(
        `[Gemini Chat] Found ${chunks.length} chunks, ${supports.length} supports`
      );

      // Validate grounding metadata
      const validation = validateGroundingMetadata(
        chunks,
        supports,
        answer.length
      );

      console.log(
        `[Gemini Chat] Validation: isValid=${validation.isValid}, qualityScore=${validation.qualityScore.toFixed(2)}`
      );

      // Retry if grounding is invalid and we have retries left
      if (!validation.isValid && retryCount < RETRY_CONFIG.maxRetries) {
        console.log(
          `[Gemini Chat] No grounding metadata, scheduling retry ${retryCount + 1}/${RETRY_CONFIG.maxRetries}`
        );

        // Wait before retry (exponential backoff)
        const delay = RETRY_CONFIG.delays[retryCount];
        await sleep(delay);

        // Recursive retry with incremented count
        return queryWithRetry(
          fileSearchStoreId,
          userQuestion,
          conversationHistory,
          retryCount + 1
        );
      }

      // Return response (even if validation failed after all retries)
      return {
        answer,
        groundingChunks: chunks,
        groundingSupports: supports,
      };
    } catch (error) {
      const err = error as GeminiApiError;

      // Handle specific error cases
      if (
        err.message?.includes('quota') ||
        err.message?.includes('rate limit')
      ) {
        throw new Error(
          'Gemini API rate limit exceeded. Please try again later.'
        );
      }

      if (err.message?.includes('timeout')) {
        throw new Error(
          'Request timeout. Please try asking a simpler question.'
        );
      }

      if (
        err.message?.includes('store') ||
        err.message?.includes('not found')
      ) {
        throw new Error(
          'File Search Store not found or papers not indexed yet.'
        );
      }

      throw new Error(
        err.message || 'Failed to generate AI response with File Search'
      );
    }
  });
}

/**
 * Extract grounding data from Gemini's response metadata
 *
 * Returns both chunks (source text) and supports (text segment → chunk mapping)
 * for interactive citation display.
 *
 * @param groundingMetadata - Grounding metadata from Gemini response
 * @returns Object containing chunks and supports arrays
 */
function extractGroundingData(groundingMetadata: unknown): {
  chunks: GroundingChunk[];
  supports: GroundingSupport[];
} {
  if (!groundingMetadata) {
    console.log('[Gemini Chat] No grounding metadata found');
    return { chunks: [], supports: [] };
  }

  // Extract grounding chunks
  const metadata = groundingMetadata as Record<string, unknown>;
  const rawChunks =
    (metadata.groundingChunks as unknown[]) ||
    (metadata.grounding_chunks as unknown[]) ||
    [];

  // Extract grounding supports
  const rawSupports =
    (metadata.groundingSupports as unknown[]) ||
    (metadata.grounding_supports as unknown[]) ||
    [];

  interface RawChunk {
    retrievedContext?: {
      text?: string;
      fileSearchStore?: string;
    };
  }

  interface RawSupport {
    segment?: {
      startIndex?: number;
      endIndex?: number;
      text?: string;
    };
    groundingChunkIndices?: number[];
  }

  // Type-safe chunk extraction
  const chunks: GroundingChunk[] = Array.isArray(rawChunks)
    ? rawChunks
        .filter((chunk): chunk is RawChunk => {
          const c = chunk as RawChunk;
          return !!c.retrievedContext?.text;
        })
        .map(chunk => ({
          retrievedContext: {
            text: chunk.retrievedContext!.text!,
            fileSearchStore: chunk.retrievedContext!.fileSearchStore,
          },
        }))
    : [];

  // Type-safe support extraction
  const supports: GroundingSupport[] = Array.isArray(rawSupports)
    ? rawSupports
        .filter((support): support is RawSupport => {
          const s = support as RawSupport;
          return !!s.segment && Array.isArray(s.groundingChunkIndices);
        })
        .map(support => ({
          segment: {
            startIndex: support.segment!.startIndex || 0,
            endIndex: support.segment!.endIndex || 0,
            text: support.segment!.text || '',
          },
          groundingChunkIndices: support.groundingChunkIndices!,
        }))
    : [];

  return { chunks, supports };
}
