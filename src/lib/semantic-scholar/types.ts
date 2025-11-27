/**
 * Semantic Scholar API Types
 * Documentation: https://api.semanticscholar.org/api-docs/graph
 */

/**
 * Author information
 */
export interface Author {
  authorId: string;
  name: string;
}

/**
 * Open Access PDF information
 */
export interface OpenAccessPdf {
  url: string;
  status: 'GOLD' | 'GREEN' | 'BRONZE' | 'HYBRID' | 'CLOSED';
}

/**
 * External IDs for the paper
 */
export interface ExternalIds {
  ArXiv?: string;
  DOI?: string;
  PubMed?: string;
  MAG?: string;
  ACL?: string;
  CorpusId?: string;
}

/**
 * SPECTER embedding from Semantic Scholar
 * The batch API returns embedding with model and vector fields
 * Model is typically 'specter_v1' (768-dimensional)
 * Note: Some papers may have embedding: null
 */
export interface PaperEmbedding {
  model?: string; // e.g., 'specter_v1'
  vector?: number[]; // 768-dimensional vector
}

/**
 * Paper metadata from Semantic Scholar
 */
export interface Paper {
  paperId: string;
  title: string;
  abstract?: string;
  authors: Author[];
  year?: number;
  citationCount?: number;
  venue?: string;
  publicationTypes?: string[];
  openAccessPdf?: OpenAccessPdf | null;
  externalIds?: ExternalIds;
  /** SPECTER embedding (optional, fetched via batch API, not available in bulk search) */
  embedding?: PaperEmbedding | null;
}

/**
 * Search parameters for Semantic Scholar API
 */
export interface SearchParams {
  /** Search keywords */
  keywords: string;
  /** Start year (inclusive) */
  yearFrom?: number;
  /** End year (inclusive) */
  yearTo?: number;
  /** Minimum citation count */
  minCitations?: number;
  /** Only return Open Access papers */
  openAccessOnly?: boolean;
  /** Maximum number of results (default: 100, max: 1000) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Fields to return (default: paperId,title,abstract,authors,year,citationCount,openAccessPdf) */
  fields?: string[];
}

/**
 * Semantic Scholar API response for bulk search
 */
export interface SearchResponse {
  total: number;
  offset: number;
  next?: number;
  token?: string | null; // For bulk search pagination
  data: Paper[];
}

/**
 * Error response from Semantic Scholar API
 */
export interface ApiError {
  error: string;
  message?: string;
}

/**
 * Cache entry for search results
 */
export interface CacheEntry {
  data: SearchResponse;
  timestamp: number;
}
