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
