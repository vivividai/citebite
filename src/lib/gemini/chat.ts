/**
 * Gemini chat functions with File Search integration for RAG
 *
 * Provides functions to query Gemini with File Search tool for
 * citation-backed AI conversations with research papers.
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';
import { GeminiApiError } from './types';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';

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
 * Query Gemini with File Search tool for RAG-based chat
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
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    try {
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
          parts: [{ text: userQuestion }],
        },
      ];

      // Call Gemini with File Search tool
      // Based on official documentation: https://ai.google.dev/gemini-api/docs/file-search
      console.log(`[Gemini Chat] File Search Store ID: ${fileSearchStoreId}`);
      console.log(
        `[Gemini Chat] File Search Store Name: fileSearchStores/${fileSearchStoreId}`
      );

      const requestConfig = {
        model: 'gemini-2.5-flash',
        contents,
        config: {
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
        JSON.stringify(requestConfig, null, 2)
      );

      const response = await client.models.generateContent(requestConfig);

      // Log full response for debugging (can be removed in production)
      console.log('[Gemini Chat] Response:', JSON.stringify(response, null, 2));

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
