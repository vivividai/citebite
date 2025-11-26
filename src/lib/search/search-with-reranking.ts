/**
 * Search with Semantic Re-ranking Pipeline
 *
 * This module integrates:
 * 1. Semantic Scholar paper search (bulk API with pagination - fetches ALL matching papers)
 * 2. Semantic Scholar batch API with PARALLEL requests (to fetch embeddings efficiently)
 * 3. SPECTER API for user query embedding
 * 4. Cosine similarity calculation for re-ranking
 *
 * Note: The bulk search API does NOT support embedding field.
 * We use a two-step approach: search first, then batch fetch embeddings in parallel.
 *
 * Fallback: If query embedding generation fails, returns papers in
 * keyword-match order (original Semantic Scholar relevance).
 */

import { getSemanticScholarClient } from '../semantic-scholar/client';
import { generateQueryEmbedding } from '../semantic-scholar/specter-client';
import { rerankBySimilarity } from '../utils/vector';
import type { Paper } from '../semantic-scholar/types';
import type {
  SearchWithRerankingParams,
  SearchWithRerankingResult,
  PaperWithSimilarity,
} from './types';

// Default limits
const DEFAULT_MAX_PAPERS = 10000; // Max papers to fetch from bulk search
const DEFAULT_FINAL_LIMIT = 100; // Final number of papers to return after re-ranking

/**
 * Search for papers and re-rank by semantic similarity to user query
 *
 * Pipeline:
 * 1. Search Semantic Scholar for ALL papers (up to maxPapers) using pagination
 * 2. Generate embedding for user query via SPECTER API (cached)
 * 3. Fetch embeddings for ALL search results via PARALLEL batch API calls
 * 4. Calculate cosine similarity between query and each paper
 * 5. Return top N papers sorted by similarity
 *
 * If query embedding fails, falls back to keyword-match order.
 *
 * @param params Search and re-ranking parameters
 * @returns Papers with similarity scores and statistics
 */
export async function searchWithReranking(
  params: SearchWithRerankingParams
): Promise<SearchWithRerankingResult> {
  const {
    userQuery,
    searchKeywords,
    initialLimit = DEFAULT_MAX_PAPERS, // Now this means max papers to fetch
    finalLimit = DEFAULT_FINAL_LIMIT,
    yearFrom,
    yearTo,
    minCitations,
    openAccessOnly,
  } = params;

  const client = getSemanticScholarClient();

  console.log(`[Reranking] Starting search with re-ranking pipeline`);
  console.log(
    `[Reranking] Max papers to fetch: ${initialLimit}, Final limit: ${finalLimit}`
  );

  // 1. Execute search and query embedding generation in parallel
  // searchAllPapers fetches ALL matching papers using token-based pagination
  const [searchResult, queryEmbedding] = await Promise.all([
    client.searchAllPapers(
      {
        keywords: searchKeywords,
        yearFrom,
        yearTo,
        minCitations,
        openAccessOnly,
      },
      initialLimit
    ),
    generateQueryEmbedding(userQuery),
  ]);

  const papers = searchResult.papers;
  const totalAvailable = searchResult.total;

  console.log(
    `[Reranking] Fetched ${papers.length} papers from bulk search (${totalAvailable} total available)`
  );

  // 2. Handle fallback case: query embedding generation failed
  if (!queryEmbedding) {
    console.warn(
      '[Reranking] Query embedding generation failed, using keyword order'
    );
    return {
      papers: papers.slice(0, finalLimit) as PaperWithSimilarity[],
      stats: {
        totalSearched: papers.length,
        totalAvailable,
        papersWithEmbeddings: 0,
        rerankingApplied: false,
        fallbackReason: 'QUERY_EMBEDDING_FAILED',
      },
    };
  }

  // 3. Fetch embeddings via PARALLEL batch API
  console.log('[Reranking] Fetching embeddings via parallel batch API...');
  const paperIds = papers.map(p => p.paperId);
  const papersWithEmbeddings = await client.getPapersBatchParallel(paperIds, {
    includeEmbedding: true,
  });

  // 4. Merge embeddings into original papers
  // Create a map of paperId -> embedding for quick lookup
  const embeddingMap = new Map<string, Paper['embedding']>();
  for (const paper of papersWithEmbeddings) {
    if (paper && paper.paperId && paper.embedding?.vector) {
      embeddingMap.set(paper.paperId, paper.embedding);
    }
  }

  // Merge embeddings into original papers (preserving all metadata)
  const papersWithMergedEmbeddings = papers.map(paper => ({
    ...paper,
    embedding: embeddingMap.get(paper.paperId) || null,
  }));

  const validEmbeddingCount = embeddingMap.size;
  console.log(
    `[Reranking] Found ${validEmbeddingCount}/${papers.length} papers with valid embeddings`
  );

  // 5. Handle case: no papers have embeddings
  if (validEmbeddingCount === 0) {
    console.warn('[Reranking] No papers have embeddings, using keyword order');
    return {
      papers: papers.slice(0, finalLimit) as PaperWithSimilarity[],
      stats: {
        totalSearched: papers.length,
        totalAvailable,
        papersWithEmbeddings: 0,
        rerankingApplied: false,
        fallbackReason: 'NO_PAPER_EMBEDDINGS',
      },
    };
  }

  // 6. Perform re-ranking
  const rankedPapers = rerankBySimilarity(
    papersWithMergedEmbeddings,
    queryEmbedding,
    finalLimit
  );

  console.log(
    `[Reranking] Successfully re-ranked ${rankedPapers.length} papers from ${papers.length} candidates`
  );

  return {
    papers: rankedPapers,
    stats: {
      totalSearched: papers.length,
      totalAvailable,
      papersWithEmbeddings: validEmbeddingCount,
      rerankingApplied: true,
    },
  };
}
