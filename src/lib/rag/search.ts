/**
 * Hybrid Search for Custom RAG
 *
 * Combines vector similarity search with keyword search using RRF (Reciprocal Rank Fusion).
 */

import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { generateQueryEmbedding } from './embeddings';

export interface SearchResult {
  chunkId: string;
  paperId: string;
  content: string;
  chunkIndex: number;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
}

export interface SearchOptions {
  /** Maximum number of results to return (default: 20) */
  limit?: number;
  /** Weight for semantic search (0-1, default: 0.7) */
  semanticWeight?: number;
}

/**
 * Perform hybrid search combining vector and keyword search
 *
 * Uses the hybrid_search PostgreSQL function which:
 * 1. Performs vector similarity search using cosine distance
 * 2. Performs full-text keyword search using tsvector
 * 3. Combines results using RRF (Reciprocal Rank Fusion)
 *
 * @param collectionId - Collection to search within
 * @param query - User's search query
 * @param options - Search options (limit, semanticWeight)
 * @returns Array of search results sorted by combined score
 *
 * @example
 * ```typescript
 * const results = await hybridSearch(
 *   'collection-uuid',
 *   'What is the attention mechanism in transformers?'
 * );
 * // Returns top 20 relevant chunks
 * ```
 */
export async function hybridSearch(
  collectionId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 20, semanticWeight = 0.7 } = options;

  console.log(`[Search] Starting hybrid search for collection ${collectionId}`);
  console.log(`[Search] Query: "${query.substring(0, 100)}..."`);

  // 1. Generate query embedding
  console.log('[Search] Generating query embedding...');
  const queryEmbedding = await generateQueryEmbedding(query);

  // 2. Call hybrid_search PostgreSQL function
  console.log('[Search] Executing hybrid search...');
  const supabase = createAdminSupabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('hybrid_search', {
    p_collection_id: collectionId,
    p_query_embedding: JSON.stringify(queryEmbedding),
    p_query_text: query,
    p_limit: limit,
    p_semantic_weight: semanticWeight,
  });

  if (error) {
    throw new Error(`Hybrid search failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.log('[Search] No results found');
    return [];
  }

  // 3. Transform results
  const results: SearchResult[] = data.map(
    (row: {
      chunk_id: string;
      paper_id: string;
      content: string;
      chunk_index: number;
      semantic_score: number;
      keyword_score: number;
      combined_score: number;
    }) => ({
      chunkId: row.chunk_id,
      paperId: row.paper_id,
      content: row.content,
      chunkIndex: row.chunk_index,
      semanticScore: row.semantic_score,
      keywordScore: row.keyword_score,
      combinedScore: row.combined_score,
    })
  );

  console.log(`[Search] Found ${results.length} results`);
  console.log(
    `[Search] Top result score: ${results[0]?.combinedScore.toFixed(4)}`
  );

  return results;
}

/**
 * Perform vector-only search (without keyword matching)
 *
 * Useful when you need pure semantic similarity without keyword boosting.
 *
 * @param collectionId - Collection to search within
 * @param query - User's search query
 * @param limit - Maximum results (default: 20)
 * @returns Array of search results sorted by semantic score
 */
export async function vectorSearch(
  collectionId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  console.log(
    `[Search] Starting vector-only search for collection ${collectionId}`
  );

  // 1. Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(query);

  // 2. Direct vector search
  const supabase = createAdminSupabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('vector_search', {
    p_collection_id: collectionId,
    p_query_embedding: JSON.stringify(queryEmbedding),
    p_limit: limit,
  });

  if (error) {
    // Fallback if vector_search function doesn't exist
    // This can happen before migration is applied
    console.warn(
      '[Search] vector_search function not found, using hybrid search'
    );
    return hybridSearch(collectionId, query, { limit, semanticWeight: 1.0 });
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map(
    (row: {
      chunk_id: string;
      paper_id: string;
      content: string;
      chunk_index: number;
      score: number;
    }) => ({
      chunkId: row.chunk_id,
      paperId: row.paper_id,
      content: row.content,
      chunkIndex: row.chunk_index,
      semanticScore: row.score,
      keywordScore: 0,
      combinedScore: row.score,
    })
  );
}
