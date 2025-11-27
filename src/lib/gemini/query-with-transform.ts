/**
 * Query with Transform - Unified Entry Point
 *
 * Main entry point for the query transformation pipeline.
 * Orchestrates: Transform → Parallel RAG → Synthesis
 *
 * Falls back to standard queryWithFileSearch on failures.
 */

import { queryWithFileSearch, ConversationMessage, ChatResponse } from './chat';
import { transformQuery } from './query-transform';
import { executeParallelQueries, hasEnoughResults } from './parallel-rag';
import { synthesizeResponses, getBestSubQueryAnswer } from './synthesis';

/**
 * Minimum number of successful sub-queries required before synthesis
 */
const MIN_SUCCESSFUL_QUERIES = 2;

/**
 * Query Gemini with File Search using query transformation
 *
 * Pipeline:
 * 1. Transform: Rewrite query + generate 5 sub-queries
 * 2. Parallel RAG: Execute all 5 sub-queries in parallel
 * 3. Synthesis: Combine answers into a coherent response
 *
 * Falls back to standard queryWithFileSearch if:
 * - Transform step fails
 * - Fewer than 2 sub-queries succeed
 * - Synthesis step fails
 *
 * @param fileSearchStoreId - The File Search Store ID containing indexed papers
 * @param userQuestion - The user's question
 * @param conversationHistory - Previous messages in the conversation
 * @returns Promise with AI answer and grounding metadata
 */
export async function queryWithTransform(
  fileSearchStoreId: string,
  userQuestion: string,
  conversationHistory: ConversationMessage[] = []
): Promise<ChatResponse> {
  const startTime = Date.now();

  console.log('\n');
  console.log(
    '[QueryWithTransform] ══════════════════════════════════════════════════'
  );
  console.log('[QueryWithTransform] 🚀 Query Transformation Pipeline Started');
  console.log(
    '[QueryWithTransform] ══════════════════════════════════════════════════'
  );
  console.log(
    `[QueryWithTransform] 📝 Question: "${userQuestion.substring(0, 100)}${userQuestion.length > 100 ? '...' : ''}"`
  );
  console.log(
    `[QueryWithTransform] 📚 Context: ${conversationHistory.length} previous messages`
  );
  console.log(
    `[QueryWithTransform] 📦 File Search Store: ${fileSearchStoreId}`
  );

  try {
    // ═══════════════════════════════════════════════════════════════════
    // Step 1: Transform query
    // ═══════════════════════════════════════════════════════════════════
    const transformStartTime = Date.now();

    let transformResult;
    try {
      transformResult = await transformQuery(userQuestion, conversationHistory);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`[QueryWithTransform] ✗ Transform failed: ${errorMessage}`);
      console.log('[QueryWithTransform] ⚠️ Falling back to standard query...');
      return await fallbackToStandard(
        fileSearchStoreId,
        userQuestion,
        conversationHistory,
        'transform_failed'
      );
    }

    const transformElapsed = Date.now() - transformStartTime;
    console.log(
      `[QueryWithTransform] ✓ Step 1 complete: ${transformResult.subQueries.length} sub-queries in ${transformElapsed}ms`
    );

    // ═══════════════════════════════════════════════════════════════════
    // Step 2: Execute parallel RAG queries
    // ═══════════════════════════════════════════════════════════════════
    const ragStartTime = Date.now();

    let subQueryResults;
    try {
      subQueryResults = await executeParallelQueries(
        fileSearchStoreId,
        transformResult.subQueries,
        conversationHistory
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[QueryWithTransform] ✗ Parallel RAG failed: ${errorMessage}`
      );
      console.log('[QueryWithTransform] ⚠️ Falling back to standard query...');
      return await fallbackToStandard(
        fileSearchStoreId,
        userQuestion,
        conversationHistory,
        'parallel_rag_failed'
      );
    }

    const ragElapsed = Date.now() - ragStartTime;
    const successCount = subQueryResults.filter(r => r.success).length;
    const totalChunks = subQueryResults.reduce(
      (sum, r) => sum + r.groundingChunks.length,
      0
    );
    console.log(
      `[QueryWithTransform] ✓ Step 2 complete: ${successCount}/${subQueryResults.length} queries, ${totalChunks} chunks in ${ragElapsed}ms`
    );

    // Check if we have enough successful results
    if (!hasEnoughResults(subQueryResults, MIN_SUCCESSFUL_QUERIES)) {
      console.warn(
        `[QueryWithTransform] ⚠️ Only ${successCount} successful (need ${MIN_SUCCESSFUL_QUERIES}+)`
      );
      console.log('[QueryWithTransform] ⚠️ Falling back to standard query...');
      return await fallbackToStandard(
        fileSearchStoreId,
        userQuestion,
        conversationHistory,
        'insufficient_results'
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // Step 3: Synthesize responses
    // ═══════════════════════════════════════════════════════════════════
    const synthesisStartTime = Date.now();

    let response;
    try {
      response = await synthesizeResponses(userQuestion, subQueryResults);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`[QueryWithTransform] ✗ Synthesis failed: ${errorMessage}`);
      console.log(
        '[QueryWithTransform] ⚠️ Using best sub-query answer instead...'
      );
      response = getBestSubQueryAnswer(subQueryResults);
    }

    const synthesisElapsed = Date.now() - synthesisStartTime;
    console.log(
      `[QueryWithTransform] ✓ Step 3 complete: synthesis in ${synthesisElapsed}ms`
    );

    // ═══════════════════════════════════════════════════════════════════
    // Pipeline Complete
    // ═══════════════════════════════════════════════════════════════════
    const totalElapsed = Date.now() - startTime;

    console.log(
      '[QueryWithTransform] ══════════════════════════════════════════════════'
    );
    console.log('[QueryWithTransform] ✅ Pipeline Completed Successfully');
    console.log(
      '[QueryWithTransform] ══════════════════════════════════════════════════'
    );
    console.log(
      `[QueryWithTransform] 📊 Final: ${response.groundingChunks.length} chunks, ${response.groundingSupports.length} supports`
    );
    console.log(`[QueryWithTransform] ⏱️ Total time: ${totalElapsed}ms`);
    console.log(
      `[QueryWithTransform]    ├─ Step 1 (Transform):  ${transformElapsed}ms`
    );
    console.log(
      `[QueryWithTransform]    ├─ Step 2 (Parallel):   ${ragElapsed}ms`
    );
    console.log(
      `[QueryWithTransform]    └─ Step 3 (Synthesis):  ${synthesisElapsed}ms`
    );
    console.log(
      `[QueryWithTransform] 📝 Answer preview: "${response.answer.substring(0, 150).replace(/\n/g, ' ')}..."`
    );
    console.log(
      '[QueryWithTransform] ══════════════════════════════════════════════════\n'
    );

    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`[QueryWithTransform] ✗ Unexpected error: ${errorMessage}`);
    console.log('[QueryWithTransform] ⚠️ Falling back to standard query...');
    return await fallbackToStandard(
      fileSearchStoreId,
      userQuestion,
      conversationHistory,
      'unexpected_error'
    );
  }
}

/**
 * Fallback to standard queryWithFileSearch
 *
 * @param fileSearchStoreId - The File Search Store ID
 * @param userQuestion - The user's question
 * @param conversationHistory - Previous messages
 * @param reason - Reason for fallback (for logging)
 * @returns Promise with ChatResponse from standard query
 */
async function fallbackToStandard(
  fileSearchStoreId: string,
  userQuestion: string,
  conversationHistory: ConversationMessage[],
  reason: string
): Promise<ChatResponse> {
  const startTime = Date.now();

  console.log(
    '[QueryWithTransform] ──────────────────────────────────────────────────'
  );
  console.log('[QueryWithTransform] 🔄 Fallback Mode: Standard Query');
  console.log(
    '[QueryWithTransform] ──────────────────────────────────────────────────'
  );
  console.log(`[QueryWithTransform] 📋 Reason: ${reason}`);
  console.log(
    '[QueryWithTransform] 🔄 Executing standard queryWithFileSearch...'
  );

  const response = await queryWithFileSearch(
    fileSearchStoreId,
    userQuestion,
    conversationHistory
  );

  const elapsed = Date.now() - startTime;

  console.log('[QueryWithTransform] ✓ Fallback query completed');
  console.log(
    `[QueryWithTransform] 📊 Result: ${response.groundingChunks.length} chunks, ${response.groundingSupports.length} supports`
  );
  console.log(`[QueryWithTransform] ⏱️ Fallback completed in ${elapsed}ms`);
  console.log(
    '[QueryWithTransform] ──────────────────────────────────────────────────\n'
  );

  return response;
}
