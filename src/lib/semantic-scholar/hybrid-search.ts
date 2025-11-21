/**
 * Hybrid Search: Keyword Search + SPECTER2 Semantic Re-ranking
 *
 * Combines traditional keyword search with semantic similarity
 * to find highly relevant papers
 */

import { getSemanticScholarClient } from './client';
import { getSpecterClient } from './specter-client';
import type { HybridSearchParams, PaperWithSimilarity } from './specter-types';
import type { Paper } from './types';

/**
 * Perform hybrid search: keyword search + semantic re-ranking
 *
 * Process:
 * 1. Keyword search for candidate papers (e.g., 1000 papers)
 * 2. Generate query embedding using SPECTER2
 * 3. Fetch paper embeddings for all candidates
 * 4. Compute cosine similarity between query and each paper
 * 5. Filter by similarity threshold
 * 6. Return top N papers sorted by similarity
 *
 * @param params - Hybrid search parameters
 * @returns Array of papers with similarity scores, sorted by relevance
 */
export async function hybridSearchPapers(
  params: HybridSearchParams
): Promise<PaperWithSimilarity[]> {
  const {
    keywords,
    candidateLimit,
    similarityThreshold,
    finalLimit,
    yearFrom,
    yearTo,
    minCitations,
    openAccessOnly,
  } = params;

  console.log('[HybridSearch] Starting hybrid search');
  console.log(`[HybridSearch] Keywords: "${keywords}"`);
  console.log(`[HybridSearch] Candidate limit: ${candidateLimit}`);
  console.log(`[HybridSearch] Similarity threshold: ${similarityThreshold}`);
  console.log(`[HybridSearch] Final limit: ${finalLimit}`);

  // Step 1: Keyword search for candidates
  console.log('[HybridSearch] Step 1/5: Fetching candidate papers via keyword search');
  const semanticScholarClient = getSemanticScholarClient();

  const searchResponse = await semanticScholarClient.searchPapers({
    keywords,
    limit: candidateLimit,
    yearFrom,
    yearTo,
    minCitations,
    openAccessOnly,
  });

  const candidates = searchResponse.data;
  console.log(`[HybridSearch] Found ${candidates.length} candidate papers`);

  if (candidates.length === 0) {
    console.log('[HybridSearch] No candidates found, returning empty result');
    return [];
  }

  // Step 2: Generate query embedding
  console.log('[HybridSearch] Step 2/5: Generating query embedding');
  const specterClient = getSpecterClient();

  let queryEmbedding: number[];
  try {
    queryEmbedding = await specterClient.embedQuery(keywords);
    console.log('[HybridSearch] Query embedding generated successfully');
  } catch (error) {
    console.error('[HybridSearch] Failed to generate query embedding:', error);
    throw new Error('Failed to generate query embedding for semantic search');
  }

  // Step 3: Fetch paper embeddings
  console.log('[HybridSearch] Step 3/5: Fetching paper embeddings');
  const paperIds = candidates.map(p => p.paperId);

  const embeddingResult = await specterClient.getPaperEmbeddings(paperIds);

  console.log(
    `[HybridSearch] Embeddings fetched: ${embeddingResult.successful.size} successful, ${embeddingResult.failed.length} failed`
  );

  if (embeddingResult.successful.size === 0) {
    console.error('[HybridSearch] No paper embeddings could be fetched');
    throw new Error('Failed to fetch paper embeddings for semantic search');
  }

  // Step 4: Compute similarities
  console.log('[HybridSearch] Step 4/5: Computing cosine similarities');
  const papersWithSimilarity: PaperWithSimilarity[] = [];

  for (const paper of candidates) {
    const paperEmbedding = embeddingResult.successful.get(paper.paperId);

    if (!paperEmbedding) {
      console.warn(`[HybridSearch] Skipping paper ${paper.paperId}: no embedding`);
      continue;
    }

    try {
      const similarity = specterClient.cosineSimilarity(queryEmbedding, paperEmbedding);

      papersWithSimilarity.push({
        ...paper,
        similarity,
      });
    } catch (error) {
      console.warn(`[HybridSearch] Failed to compute similarity for ${paper.paperId}:`, error);
    }
  }

  console.log(`[HybridSearch] Computed similarity for ${papersWithSimilarity.length} papers`);

  // Step 5: Filter by threshold and sort
  console.log('[HybridSearch] Step 5/5: Filtering and ranking');
  const filtered = papersWithSimilarity.filter(
    p => p.similarity >= similarityThreshold
  );

  console.log(
    `[HybridSearch] ${filtered.length} papers passed threshold ${similarityThreshold}`
  );

  // Sort by similarity (descending) and limit
  const sorted = filtered
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, finalLimit);

  console.log(`[HybridSearch] Returning top ${sorted.length} papers`);

  if (sorted.length > 0) {
    console.log(`[HybridSearch] Similarity range: ${sorted[0].similarity.toFixed(3)} - ${sorted[sorted.length - 1].similarity.toFixed(3)}`);
  }

  return sorted;
}

/**
 * Convert PaperWithSimilarity to standard Paper type
 * (removes the similarity field)
 */
export function removeSimilarityField(
  paper: PaperWithSimilarity
): Paper {
  const { similarity, ...rest } = paper;
  return rest as Paper;
}

/**
 * Fallback to keyword search if hybrid search fails
 */
export async function hybridSearchWithFallback(
  params: HybridSearchParams
): Promise<{ papers: Paper[]; usedHybridSearch: boolean }> {
  try {
    const papersWithSimilarity = await hybridSearchPapers(params);
    const papers = papersWithSimilarity.map(removeSimilarityField);

    return {
      papers,
      usedHybridSearch: true,
    };
  } catch (error) {
    console.error('[HybridSearch] Hybrid search failed, falling back to keyword search:', error);

    // Fallback to regular keyword search
    const semanticScholarClient = getSemanticScholarClient();
    const searchResponse = await semanticScholarClient.searchPapers({
      keywords: params.keywords,
      limit: params.finalLimit,
      yearFrom: params.yearFrom,
      yearTo: params.yearTo,
      minCitations: params.minCitations,
      openAccessOnly: params.openAccessOnly,
    });

    return {
      papers: searchResponse.data,
      usedHybridSearch: false,
    };
  }
}
