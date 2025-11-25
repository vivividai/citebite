/**
 * Search with Semantic Re-ranking Pipeline
 *
 * This module integrates:
 * 1. Semantic Scholar paper search (bulk API - no embeddings)
 * 2. Semantic Scholar batch API (to fetch embeddings)
 * 3. SPECTER API for user query embedding
 * 4. Cosine similarity calculation for re-ranking
 *
 * Note: The bulk search API does NOT support embedding field.
 * We use a two-step approach: search first, then batch fetch embeddings.
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
const DEFAULT_INITIAL_LIMIT = 500;
const DEFAULT_FINAL_LIMIT = 100;

/**
 * Search for papers and re-rank by semantic similarity to user query
 *
 * Pipeline:
 * 1. Search Semantic Scholar for papers (500 by default) - no embeddings
 * 2. Generate embedding for user query via SPECTER API (cached)
 * 3. Fetch embeddings for search results via batch API
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
    initialLimit = DEFAULT_INITIAL_LIMIT,
    finalLimit = DEFAULT_FINAL_LIMIT,
    yearFrom,
    yearTo,
    minCitations,
    openAccessOnly,
  } = params;

  const client = getSemanticScholarClient();

  // 1. Execute search and query embedding generation in parallel
  // Note: bulk search does NOT support embedding field
  const [searchResponse, queryEmbedding] = await Promise.all([
    client.searchPapers({
      keywords: searchKeywords,
      limit: initialLimit,
      yearFrom,
      yearTo,
      minCitations,
      openAccessOnly,
    }),
    generateQueryEmbedding(userQuery),
  ]);

  const papers = searchResponse.data;

  console.log(`[Reranking] Fetched ${papers.length} papers from bulk search`);

  // 2. Handle fallback case: query embedding generation failed
  if (!queryEmbedding) {
    console.warn(
      '[Reranking] Query embedding generation failed, using keyword order'
    );
    return {
      papers: papers.slice(0, finalLimit) as PaperWithSimilarity[],
      stats: {
        totalSearched: papers.length,
        papersWithEmbeddings: 0,
        rerankingApplied: false,
        fallbackReason: 'QUERY_EMBEDDING_FAILED',
      },
    };
  }

  // 3. Fetch embeddings via batch API
  console.log('[Reranking] Fetching embeddings via batch API...');
  const paperIds = papers.map(p => p.paperId);
  const papersWithEmbeddings = await client.getPapersBatch(paperIds, {
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
    `[Reranking] Successfully re-ranked ${rankedPapers.length} papers`
  );

  return {
    papers: rankedPapers,
    stats: {
      totalSearched: papers.length,
      papersWithEmbeddings: validEmbeddingCount,
      rerankingApplied: true,
    },
  };
}
