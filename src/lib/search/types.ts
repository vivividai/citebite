/**
 * Types for Search with Re-ranking Pipeline
 */

import type { Paper } from '../semantic-scholar/types';

/**
 * Parameters for search with semantic re-ranking
 */
export interface SearchWithRerankingParams {
  /** Original user query (used for embedding generation) */
  userQuery: string;
  /** AI-generated search keywords for Semantic Scholar */
  searchKeywords: string;
  /** Maximum number of papers to fetch for re-ranking (default: 10000) */
  initialLimit?: number;
  /** Final number of papers to return after re-ranking (default: 100) */
  finalLimit?: number;
  /** Start year (inclusive) */
  yearFrom?: number;
  /** End year (inclusive) */
  yearTo?: number;
  /** Minimum citation count */
  minCitations?: number;
  /** Only return Open Access papers */
  openAccessOnly?: boolean;
}

/**
 * Paper with similarity score after re-ranking
 */
export interface PaperWithSimilarity extends Paper {
  /** Cosine similarity to query (0-1, higher is better). Undefined if re-ranking was not applied */
  similarity?: number;
}

/**
 * Statistics about the re-ranking process
 */
export interface RerankingStats {
  /** Total papers fetched from Semantic Scholar */
  totalSearched: number;
  /** Total papers available in Semantic Scholar for this query */
  totalAvailable?: number;
  /** Number of papers that had SPECTER embeddings */
  papersWithEmbeddings: number;
  /** Whether re-ranking was successfully applied */
  rerankingApplied: boolean;
  /** Reason if re-ranking was not applied */
  fallbackReason?: string;
}

/**
 * Result of search with re-ranking
 */
export interface SearchWithRerankingResult {
  /** Papers sorted by semantic similarity (if re-ranking applied) or keyword relevance */
  papers: PaperWithSimilarity[];
  /** Statistics about the re-ranking process */
  stats: RerankingStats;
}

/**
 * Simplified paper data for preview display
 */
export interface PaperPreview {
  paperId: string;
  title: string;
  authors: Array<{ name: string }>;
  year: number | null;
  abstract: string | null;
  citationCount: number | null;
  venue: string | null;
  /** Cosine similarity to query (0-1). Null if paper has no SPECTER embedding */
  similarity: number | null;
  /** Whether paper has a SPECTER embedding for similarity calculation */
  hasEmbedding: boolean;
  /** Whether paper has Open Access PDF */
  isOpenAccess: boolean;
  /** How this paper was found (for expand feature) */
  sourceType?: 'reference' | 'citation';
}
