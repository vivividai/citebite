/**
 * Parallel RAG Execution
 *
 * Executes multiple sub-queries in parallel against Gemini File Search.
 * Uses Promise.allSettled for resilient execution - partial failures don't
 * break the entire pipeline.
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';
import { ConversationMessage } from './chat';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';
import { CITATION_SYSTEM_PROMPT, buildCitationAwarePrompt } from './prompts';

/**
 * Result of a single sub-query execution
 */
export interface SubQueryResult {
  subQuery: string;
  answer: string;
  groundingChunks: GroundingChunk[];
  groundingSupports: GroundingSupport[];
  success: boolean;
  error?: string;
}

/**
 * Execute a single sub-query against File Search
 *
 * Simplified version of queryWithFileSearch without retry logic
 * (retries would add too much latency for parallel execution)
 */
async function executeSingleQuery(
  fileSearchStoreId: string,
  subQuery: string,
  conversationHistory: ConversationMessage[],
  queryIndex: number
): Promise<SubQueryResult> {
  const client = getGeminiClient();
  const startTime = Date.now();

  try {
    // Build prompt with citation instructions
    const prompt = buildCitationAwarePrompt(subQuery);

    // Build content array with conversation history + sub-query
    const contents = [
      ...conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: prompt }],
      },
    ];

    const response = await client.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents,
      config: {
        systemInstruction: CITATION_SYSTEM_PROMPT,
        temperature: 0.2,
        tools: [
          {
            fileSearch: {
              fileSearchStoreNames: [`fileSearchStores/${fileSearchStoreId}`],
            },
          },
        ],
      },
    });

    // Extract answer
    const answer =
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No answer generated';

    // Extract grounding metadata
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const { chunks, supports } = extractGroundingData(groundingMetadata);

    const elapsed = Date.now() - startTime;
    console.log(
      `[ParallelRAG]   ├─ [${queryIndex + 1}/5] ✓ Completed in ${elapsed}ms (${chunks.length} chunks, ${supports.length} supports)`
    );

    return {
      subQuery,
      answer,
      groundingChunks: chunks,
      groundingSupports: supports,
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const elapsed = Date.now() - startTime;
    console.error(
      `[ParallelRAG]   ├─ [${queryIndex + 1}/5] ✗ Failed in ${elapsed}ms: ${errorMessage}`
    );

    return {
      subQuery,
      answer: '',
      groundingChunks: [],
      groundingSupports: [],
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Extract grounding data from Gemini's response metadata
 * Exported for use in synthesis.ts
 */
export function extractGroundingData(groundingMetadata: unknown): {
  chunks: GroundingChunk[];
  supports: GroundingSupport[];
} {
  if (!groundingMetadata) {
    return { chunks: [], supports: [] };
  }

  const metadata = groundingMetadata as Record<string, unknown>;
  const rawChunks =
    (metadata.groundingChunks as unknown[]) ||
    (metadata.grounding_chunks as unknown[]) ||
    [];
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

/**
 * Execute multiple sub-queries in parallel
 *
 * Uses Promise.allSettled to ensure all queries complete (or fail gracefully).
 * Even if some sub-queries fail, others can still succeed.
 *
 * @param fileSearchStoreId - The File Search Store ID containing indexed papers
 * @param subQueries - Array of sub-queries to execute (exactly 5)
 * @param conversationHistory - Previous messages for context
 * @returns Array of SubQueryResults (both successful and failed)
 */
export async function executeParallelQueries(
  fileSearchStoreId: string,
  subQueries: string[],
  conversationHistory: ConversationMessage[] = []
): Promise<SubQueryResult[]> {
  const startTime = Date.now();

  console.log('\n[ParallelRAG] ──────────────────────────────────────────');
  console.log('[ParallelRAG] Step 2: Parallel RAG Execution');
  console.log('[ParallelRAG] ──────────────────────────────────────────');
  console.log(
    `[ParallelRAG] 🚀 Launching ${subQueries.length} parallel queries...`
  );
  console.log(`[ParallelRAG] 📦 File Search Store: ${fileSearchStoreId}`);

  // Log all queries being launched
  subQueries.forEach((q, i) => {
    console.log(
      `[ParallelRAG]   ├─ [${i + 1}/5] Starting: "${q.substring(0, 60)}${q.length > 60 ? '...' : ''}"`
    );
  });

  // Use withGeminiErrorHandling for the overall operation
  const results = await withGeminiErrorHandling(async () => {
    // Execute all sub-queries in parallel
    const promises = subQueries.map((subQuery, index) =>
      executeSingleQuery(
        fileSearchStoreId,
        subQuery,
        conversationHistory,
        index
      )
    );

    // Wait for all to complete (success or failure)
    const settled = await Promise.allSettled(promises);

    // Extract results
    return settled.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Promise was rejected (unexpected error)
        console.error(
          `[ParallelRAG]   ├─ [${index + 1}/5] ✗ Promise rejected: ${result.reason?.message}`
        );
        return {
          subQuery: subQueries[index],
          answer: '',
          groundingChunks: [],
          groundingSupports: [],
          success: false,
          error: result.reason?.message || 'Promise rejected',
        };
      }
    });
  });

  const elapsed = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const totalChunks = results.reduce(
    (sum, r) => sum + r.groundingChunks.length,
    0
  );
  const totalSupports = results.reduce(
    (sum, r) => sum + r.groundingSupports.length,
    0
  );

  console.log('[ParallelRAG] ──────────────────────────────────────────');
  console.log(
    `[ParallelRAG] ✓ Step 2 completed: ${successCount}/${subQueries.length} successful`
  );
  console.log(
    `[ParallelRAG] 📊 Total grounding: ${totalChunks} chunks, ${totalSupports} supports`
  );
  console.log(`[ParallelRAG] ⏱️ Step 2 completed in ${elapsed}ms`);

  return results;
}

/**
 * Check if we have enough successful results to proceed with synthesis
 *
 * @param results - Array of SubQueryResults
 * @param minRequired - Minimum number of successful results (default: 2)
 * @returns True if we have enough successful results
 */
export function hasEnoughResults(
  results: SubQueryResult[],
  minRequired: number = 2
): boolean {
  const successCount = results.filter(r => r.success).length;
  return successCount >= minRequired;
}
