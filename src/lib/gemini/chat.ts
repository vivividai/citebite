/**
 * Gemini chat functions with File Search integration for RAG
 *
 * Provides functions to query Gemini with File Search tool for
 * citation-backed AI conversations with research papers.
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';
import { GeminiApiError } from './types';
import { CitedPaper } from '@/lib/db/messages';

/**
 * Conversation message format
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Chat response with citations
 */
export interface ChatResponse {
  answer: string;
  citedPapers: CitedPaper[];
}

/**
 * Query Gemini with File Search tool for RAG-based chat
 *
 * @param fileSearchStoreId - The File Search Store ID containing indexed papers
 * @param userQuestion - The user's question
 * @param conversationHistory - Previous messages in the conversation (last 5-10 messages)
 * @param collectionPaperIds - Array of paper IDs in the collection (for validation)
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
 *   ],
 *   ['paper1', 'paper2']
 * );
 * ```
 */
export async function queryWithFileSearch(
  fileSearchStoreId: string,
  userQuestion: string,
  conversationHistory: ConversationMessage[] = [],
  collectionPaperIds: string[] = []
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
      const response = await client.models.generateContent({
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
      });

      // Log full response for debugging (can be removed in production)
      console.log('[Gemini Chat] Response:', JSON.stringify(response, null, 2));

      // Extract answer text
      const answer =
        response.candidates?.[0]?.content?.parts?.[0]?.text ||
        'No answer generated';

      // Extract grounding metadata for citations
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

      // Extract citations from grounding metadata
      const citedPapers = extractCitationsFromMetadata(
        groundingMetadata,
        collectionPaperIds
      );

      return {
        answer,
        citedPapers,
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
 * Extract citations from Gemini's grounding metadata
 *
 * Maps grounding chunks to paper IDs using custom metadata stored during upload.
 * The structure of grounding metadata may vary, so this function handles different formats.
 *
 * @param groundingMetadata - Grounding metadata from Gemini response
 * @param collectionPaperIds - Array of paper IDs in collection for validation
 * @returns Array of cited papers with metadata
 */
function extractCitationsFromMetadata(
  groundingMetadata: unknown,
  collectionPaperIds: string[]
): CitedPaper[] {
  if (!groundingMetadata) {
    console.log('[Gemini Chat] No grounding metadata found');
    return [];
  }

  // Log metadata structure for debugging
  console.log(
    '[Gemini Chat] Grounding metadata:',
    JSON.stringify(groundingMetadata, null, 2)
  );

  const citedPapers: CitedPaper[] = [];
  const seenPaperIds = new Set<string>();

  // Try to extract from groundingChunks
  // The exact structure may vary, so we handle multiple possible formats
  const chunks =
    groundingMetadata.groundingChunks ||
    groundingMetadata.grounding_chunks ||
    [];

  for (const chunk of chunks) {
    try {
      // Try to extract paper_id from chunk metadata
      // Chunks may contain references to the documents we uploaded
      const documentName = chunk.document?.name || chunk.documentName;
      const metadata = chunk.document?.metadata || chunk.metadata;

      // Log chunk structure for debugging
      console.log(
        '[Gemini Chat] Processing chunk:',
        JSON.stringify(chunk, null, 2)
      );

      // Try to extract paper_id from custom metadata
      let paperId: string | null = null;

      if (metadata) {
        // Check different possible formats for paper_id in metadata
        paperId =
          metadata.paper_id ||
          metadata.paperId ||
          metadata.customMetadata?.paper_id ||
          metadata.customMetadata?.paperId;

        // If metadata is an array (as it might be in custom metadata format)
        if (Array.isArray(metadata)) {
          const paperIdEntry = metadata.find(
            (m: unknown) =>
              typeof m === 'object' &&
              m !== null &&
              'key' in m &&
              (m.key === 'paper_id' || m.key === 'paperId')
          );
          if (
            paperIdEntry &&
            typeof paperIdEntry === 'object' &&
            paperIdEntry !== null
          ) {
            paperId =
              ('stringValue' in paperIdEntry
                ? (paperIdEntry as { stringValue?: string }).stringValue
                : undefined) ||
              ('value' in paperIdEntry
                ? (paperIdEntry as { value?: string }).value
                : undefined);
          }
        }
      }

      // If we couldn't extract paper_id, try to extract from document name
      // Document names might follow a pattern like "papers/{paper_id}"
      if (!paperId && documentName) {
        const match = documentName.match(/papers\/([^/]+)/);
        if (match) {
          paperId = match[1];
        }
      }

      // Validate paper_id exists in collection
      if (paperId && collectionPaperIds.includes(paperId)) {
        // Avoid duplicates
        if (!seenPaperIds.has(paperId)) {
          seenPaperIds.add(paperId);

          // Extract relevance score if available
          const relevanceScore = chunk.relevanceScore || chunk.relevance_score;

          citedPapers.push({
            paperId,
            title: metadata?.title || 'Unknown paper',
            relevanceScore: relevanceScore || undefined,
          });
        }
      } else if (paperId) {
        console.warn(
          `[Gemini Chat] Paper ${paperId} cited but not in collection (possible hallucination)`
        );
      }
    } catch (error) {
      console.error('[Gemini Chat] Error processing chunk:', error);
      // Continue processing other chunks
    }
  }

  console.log(`[Gemini Chat] Extracted ${citedPapers.length} citations`);
  return citedPapers;
}
