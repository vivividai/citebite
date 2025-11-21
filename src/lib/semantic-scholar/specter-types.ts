/**
 * SPECTER2 API Types
 *
 * Semantic Scholar's SPECTER2 model for paper embeddings
 * https://model-apis.semanticscholar.org/specter/v1/invoke
 */

/**
 * Request format for SPECTER2 embedding API
 */
export interface SpecterEmbeddingRequest {
  papers: Array<{
    title: string;
    abstract?: string;
  }>;
}

/**
 * Response format from SPECTER2 embedding API
 */
export interface SpecterEmbeddingResponse {
  embeddings: number[][]; // Array of 768-dimensional vectors
}

/**
 * Paper with computed similarity score
 */
export interface PaperWithSimilarity {
  paperId: string;
  title: string;
  abstract: string | null;
  authors: Array<{ authorId: string | null; name: string }>;
  year: number | null;
  citationCount: number | null;
  venue: string | null;
  publicationTypes: string[] | null;
  openAccessPdf: { url: string; status?: string } | null;
  externalIds: Record<string, string> | null;
  similarity: number; // Cosine similarity (0-1)
}

/**
 * Parameters for hybrid search
 */
export interface HybridSearchParams {
  keywords: string;
  candidateLimit: number; // Number of papers to fetch before filtering (e.g., 1000)
  similarityThreshold: number; // Minimum similarity to include (0.5 - 0.9)
  finalLimit: number; // Maximum papers to return after filtering (e.g., 100)

  // Standard filters
  yearFrom?: number;
  yearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
}

/**
 * Cache entry for embeddings
 */
export interface EmbeddingCacheEntry {
  paperId: string;
  embedding: number[]; // 768-dimensional vector
  timestamp: number;
}

/**
 * Batch processing result
 */
export interface BatchEmbeddingResult {
  successful: Map<string, number[]>; // paperId -> embedding
  failed: string[]; // paperIds that failed to fetch
}
