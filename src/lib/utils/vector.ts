/**
 * Vector Utilities for Embedding Operations
 * Used for cosine similarity calculation and re-ranking papers by semantic similarity
 */

/**
 * Calculate cosine similarity between two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Cosine similarity value between -1 and 1
 * @throws Error if vectors have different dimensions
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  // Handle zero vectors
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Paper type with optional embedding for re-ranking
 * Matches Semantic Scholar batch API response structure
 */
interface PaperWithOptionalEmbedding {
  embedding?: {
    model?: string; // e.g., 'specter_v1'
    vector?: number[]; // 768-dimensional vector
  } | null;
}

/**
 * Re-rank papers by cosine similarity to a query embedding
 * Papers without embeddings are excluded from the result
 *
 * @param papers Array of papers with optional embeddings
 * @param queryEmbedding Query embedding vector (768-dimensional for SPECTER)
 * @param topK Number of top results to return
 * @returns Array of papers with similarity scores, sorted by similarity (descending)
 */
export function rerankBySimilarity<T extends PaperWithOptionalEmbedding>(
  papers: T[],
  queryEmbedding: number[],
  topK: number
): Array<T & { similarity: number }> {
  // Filter papers that have valid embeddings (with vector array)
  const papersWithEmbedding = papers.filter(
    (p): p is T & { embedding: { model: string; vector: number[] } } =>
      p.embedding?.vector !== undefined &&
      Array.isArray(p.embedding.vector) &&
      p.embedding.vector.length > 0
  );

  // Calculate similarity for each paper
  const withSimilarity = papersWithEmbedding.map(paper => ({
    ...paper,
    similarity: cosineSimilarity(queryEmbedding, paper.embedding.vector),
  }));

  // Sort by similarity (descending)
  withSimilarity.sort((a, b) => b.similarity - a.similarity);

  // Return top K results
  return withSimilarity.slice(0, topK);
}
