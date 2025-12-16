/**
 * Semantic Scholar API Client
 * Documentation: https://api.semanticscholar.org/api-docs/graph
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import crypto from 'crypto';
import { getCache, setCache } from '../redis/client';
import type {
  SearchParams,
  SearchResponse,
  Paper,
  ApiError,
  CacheEntry,
  ReferenceBatch,
  CitationBatch,
  Reference,
  Citation,
  RelatedPapersOptions,
  PaperMatchResponse,
  AuthorSearchResponse,
  AuthorWithDetails,
} from './types';

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';
const CACHE_PREFIX = 'semantic-scholar:search:';
const CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const BATCH_SIZE = 500; // Max papers per batch API request
const PARALLEL_BATCH_LIMIT = 8; // Number of parallel batch requests
const DEFAULT_MAX_PAPERS = 10000; // Default max papers to fetch for re-ranking

/**
 * Semantic Scholar API Client
 */
export class SemanticScholarClient {
  private client: AxiosInstance;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SEMANTIC_SCHOLAR_API_KEY;

    // Create axios instance with base configuration
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        // Semantic Scholar requires a polite User-Agent
        'User-Agent':
          'CiteBite/1.0 (https://github.com/citebite/citebite; mailto:research@citebite.com)',
      },
    });

    // Add API key to headers if available
    if (this.apiKey) {
      this.client.defaults.headers.common['x-api-key'] = this.apiKey;
    } else {
      console.warn(
        'SEMANTIC_SCHOLAR_API_KEY not configured. Using rate-limited public access.'
      );
    }
  }

  /**
   * Build search query string from parameters
   * Note: Year and citation filters are now handled as separate HTTP parameters
   */
  private buildQuery(params: SearchParams): string {
    // Return only the keywords - filters are added as HTTP parameters
    return params.keywords;
  }

  /**
   * Generate cache key from search parameters
   */
  private getCacheKey(params: SearchParams): string {
    const queryString = JSON.stringify(params);
    const hash = crypto.createHash('md5').update(queryString).digest('hex');
    return `${CACHE_PREFIX}${hash}`;
  }

  /**
   * Sleep for exponential backoff
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute API request with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const axiosError = error as AxiosError<ApiError>;

      // Check if we should retry
      const shouldRetry =
        retryCount < MAX_RETRIES &&
        (axiosError.response?.status === 429 || // Rate limit
          axiosError.response?.status === 503 || // Service unavailable
          axiosError.code === 'ECONNABORTED' || // Timeout
          axiosError.code === 'ENOTFOUND' || // Network error
          axiosError.code === 'EAI_AGAIN'); // DNS error

      if (!shouldRetry) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(
        `Retrying Semantic Scholar API request (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${delay}ms...`
      );

      await this.sleep(delay);
      return this.executeWithRetry(fn, retryCount + 1);
    }
  }

  /**
   * Search for papers by keywords with filters
   * @param params Search parameters
   * @returns Search response with papers
   */
  async searchPapers(params: SearchParams): Promise<SearchResponse> {
    // Try to get from cache first
    const cacheKey = this.getCacheKey(params);
    const cached = await getCache<CacheEntry>(cacheKey);

    if (cached && cached.data) {
      console.log('Cache hit for Semantic Scholar search');
      return cached.data;
    }

    console.log('Cache miss for Semantic Scholar search');

    // Build query
    const query = this.buildQuery(params);

    // Prepare request parameters
    // Default fields for paper search
    // Note: embedding field is NOT supported in bulk search - use getPapersBatch instead
    const defaultFields =
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';

    const fields = params.fields?.join(',') || defaultFields;

    const requestParams: Record<string, string | number> = {
      query,
      fields,
      limit: params.limit || 100,
      offset: params.offset || 0,
    };

    // Add year filter if specified (as separate parameter, not in query string)
    if (params.yearFrom || params.yearTo) {
      const yearFrom = params.yearFrom || 1900;
      const yearTo = params.yearTo || new Date().getFullYear();
      requestParams.year = `${yearFrom}-${yearTo}`;
    }

    // Add minimum citation count filter if specified (as separate parameter)
    if (params.minCitations !== undefined) {
      requestParams.minCitationCount = params.minCitations;
    }

    // Add Open Access filter if specified
    if (params.openAccessOnly) {
      requestParams.openAccessPdf = '';
    }

    // Execute request with retry logic
    const response = await this.executeWithRetry(async () => {
      return this.client.get<SearchResponse>('/paper/search/bulk', {
        params: requestParams,
      });
    });

    const data = response.data;

    // Cache the result
    const cacheEntry: CacheEntry = {
      data,
      timestamp: Date.now(),
    };
    await setCache(cacheKey, cacheEntry, CACHE_TTL);

    return data;
  }

  /**
   * Get paper details by paper ID
   * @param paperId Semantic Scholar paper ID
   * @param fields Fields to return (optional)
   * @returns Paper details
   */
  async getPaper(paperId: string, fields?: string[]): Promise<Paper> {
    const requestFields =
      fields?.join(',') ||
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';

    const response = await this.executeWithRetry(async () => {
      return this.client.get<Paper>(`/paper/${paperId}`, {
        params: { fields: requestFields },
      });
    });

    return response.data;
  }

  /**
   * Get multiple papers by paper IDs (batch endpoint)
   * Supports up to 500 paper IDs per request
   *
   * @param paperIds Array of Semantic Scholar paper IDs
   * @param options Optional parameters
   * @param options.fields Fields to return (optional)
   * @param options.includeEmbedding Include SPECTER embedding (only works with batch API)
   * @returns Array of papers (may contain null for papers that don't exist)
   */
  async getPapersBatch(
    paperIds: string[],
    options?: {
      fields?: string[];
      includeEmbedding?: boolean;
    }
  ): Promise<(Paper | null)[]> {
    if (paperIds.length === 0) {
      return [];
    }

    // Batch API has a limit of 500 IDs per request
    const batches: string[][] = [];

    for (let i = 0; i < paperIds.length; i += BATCH_SIZE) {
      batches.push(paperIds.slice(i, i + BATCH_SIZE));
    }

    const defaultFields =
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';

    // Add embedding field if requested (only batch API supports this)
    const requestFields =
      options?.fields?.join(',') ||
      (options?.includeEmbedding
        ? `${defaultFields},embedding`
        : defaultFields);

    const results: (Paper | null)[] = [];

    for (const batch of batches) {
      const response = await this.executeWithRetry(async () => {
        return this.client.post<(Paper | null)[]>(
          '/paper/batch',
          { ids: batch },
          {
            params: { fields: requestFields },
          }
        );
      });

      results.push(...response.data);
    }

    return results;
  }

  /**
   * Get multiple papers by paper IDs with PARALLEL batch requests
   * Much faster than sequential getPapersBatch for large datasets
   *
   * @param paperIds Array of Semantic Scholar paper IDs
   * @param options Optional parameters
   * @param options.fields Fields to return (optional)
   * @param options.includeEmbedding Include SPECTER embedding (only works with batch API)
   * @param options.parallelLimit Number of parallel requests (default: 8)
   * @returns Array of papers (may contain null for papers that don't exist)
   */
  async getPapersBatchParallel(
    paperIds: string[],
    options?: {
      fields?: string[];
      includeEmbedding?: boolean;
      parallelLimit?: number;
    }
  ): Promise<(Paper | null)[]> {
    if (paperIds.length === 0) {
      return [];
    }

    const parallelLimit = options?.parallelLimit || PARALLEL_BATCH_LIMIT;

    // Split into batches of 500
    const batches: string[][] = [];
    for (let i = 0; i < paperIds.length; i += BATCH_SIZE) {
      batches.push(paperIds.slice(i, i + BATCH_SIZE));
    }

    const defaultFields =
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';

    const requestFields =
      options?.fields?.join(',') ||
      (options?.includeEmbedding
        ? `${defaultFields},embedding`
        : defaultFields);

    console.log(
      `[SemanticScholar] Fetching ${paperIds.length} papers in ${batches.length} batches (${parallelLimit} parallel)`
    );

    // Process batches in parallel chunks
    const allResults: (Paper | null)[][] = [];

    for (let i = 0; i < batches.length; i += parallelLimit) {
      const parallelBatches = batches.slice(i, i + parallelLimit);

      const batchPromises = parallelBatches.map(batch =>
        this.executeWithRetry(async () => {
          return this.client.post<(Paper | null)[]>(
            '/paper/batch',
            { ids: batch },
            {
              params: { fields: requestFields },
            }
          );
        })
      );

      const responses = await Promise.all(batchPromises);
      allResults.push(...responses.map(r => r.data));

      // Log progress
      const processed = Math.min(
        (i + parallelLimit) * BATCH_SIZE,
        paperIds.length
      );
      console.log(
        `[SemanticScholar] Progress: ${processed}/${paperIds.length} papers`
      );
    }

    // Flatten results
    return allResults.flat();
  }

  /**
   * Search for ALL papers matching keywords using bulk search with pagination
   * Uses token-based pagination to fetch all results up to maxPapers limit
   *
   * @param params Search parameters
   * @param maxPapers Maximum number of papers to fetch (default: 10000)
   * @returns All matching papers up to maxPapers limit
   */
  async searchAllPapers(
    params: SearchParams,
    maxPapers: number = DEFAULT_MAX_PAPERS
  ): Promise<{ papers: Paper[]; total: number }> {
    // Build query
    const query = this.buildQuery(params);

    // Default fields for paper search (no embedding - use batch API for that)
    const defaultFields =
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';
    const fields = params.fields?.join(',') || defaultFields;

    const requestParams: Record<string, string | number> = {
      query,
      fields,
    };

    // Add year filter
    if (params.yearFrom || params.yearTo) {
      const yearFrom = params.yearFrom || 1900;
      const yearTo = params.yearTo || new Date().getFullYear();
      requestParams.year = `${yearFrom}-${yearTo}`;
    }

    // Add minimum citation count filter
    if (params.minCitations !== undefined) {
      requestParams.minCitationCount = params.minCitations;
    }

    // Add Open Access filter
    if (params.openAccessOnly) {
      requestParams.openAccessPdf = '';
    }

    const allPapers: Paper[] = [];
    let token: string | null = null;
    let total = 0;
    let pageCount = 0;

    console.log(`[SemanticScholar] Starting bulk search for: "${query}"`);

    // Fetch pages using token-based pagination
    do {
      const currentParams = { ...requestParams };
      if (token) {
        currentParams.token = token;
      }

      const response = await this.executeWithRetry(async () => {
        return this.client.get<SearchResponse>('/paper/search/bulk', {
          params: currentParams,
        });
      });

      const data = response.data;
      total = data.total || 0;
      token = data.token || null;

      if (data.data && data.data.length > 0) {
        allPapers.push(...data.data);
        pageCount++;
        console.log(
          `[SemanticScholar] Page ${pageCount}: fetched ${data.data.length} papers (total: ${allPapers.length}/${total})`
        );
      }

      // Stop if we've reached the max or no more pages
      if (allPapers.length >= maxPapers || !token) {
        break;
      }
    } while (token);

    // Trim to maxPapers if needed
    const papers = allPapers.slice(0, maxPapers);

    console.log(
      `[SemanticScholar] Bulk search complete: ${papers.length} papers fetched (${total} total available)`
    );

    return { papers, total };
  }

  /**
   * Get references for a paper (papers that this paper cites)
   * @param paperId Semantic Scholar paper ID
   * @param options Optional parameters for pagination and fields
   * @returns Reference batch with pagination info
   */
  async getReferences(
    paperId: string,
    options?: RelatedPapersOptions
  ): Promise<ReferenceBatch> {
    const defaultFields =
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';
    const fields = options?.fields?.join(',') || defaultFields;

    const requestParams: Record<string, string | number> = {
      fields,
      limit: options?.limit || 100,
    };

    if (options?.offset) {
      requestParams.offset = options.offset;
    }

    const response = await this.executeWithRetry(async () => {
      return this.client.get<ReferenceBatch>(`/paper/${paperId}/references`, {
        params: requestParams,
      });
    });

    return response.data;
  }

  /**
   * Get all references with pagination
   * @param paperId Semantic Scholar paper ID
   * @param options Optional parameters for max references and influential filter
   * @returns Array of all references
   */
  async getAllReferences(
    paperId: string,
    options?: { maxReferences?: number; influentialOnly?: boolean }
  ): Promise<Reference[]> {
    const allReferences: Reference[] = [];
    const maxRefs = options?.maxReferences || 500;
    let offset = 0;
    const limit = 100;

    console.log(
      `[SemanticScholar] Fetching references for paper ${paperId} (max: ${maxRefs})`
    );

    while (allReferences.length < maxRefs) {
      const batch = await this.getReferences(paperId, { offset, limit });

      if (!batch.data || batch.data.length === 0) {
        break;
      }

      // Filter by influential if requested
      const refs = options?.influentialOnly
        ? batch.data.filter(r => r.isInfluential)
        : batch.data;

      allReferences.push(...refs);

      // Check if there are more pages
      if (batch.next === undefined || batch.next === null) {
        break;
      }

      offset = batch.next;

      // Rate limiting - add small delay between requests
      await this.sleep(100);
    }

    // Trim to maxReferences if needed
    const result = allReferences.slice(0, maxRefs);

    console.log(
      `[SemanticScholar] Retrieved ${result.length} references for paper ${paperId}`
    );

    return result;
  }

  /**
   * Get citations for a paper (papers that cite this paper)
   * @param paperId Semantic Scholar paper ID
   * @param options Optional parameters for pagination and fields
   * @returns Citation batch with pagination info
   */
  async getCitations(
    paperId: string,
    options?: RelatedPapersOptions
  ): Promise<CitationBatch> {
    const defaultFields =
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';
    const fields = options?.fields?.join(',') || defaultFields;

    const requestParams: Record<string, string | number> = {
      fields,
      limit: options?.limit || 100,
    };

    if (options?.offset) {
      requestParams.offset = options.offset;
    }

    const response = await this.executeWithRetry(async () => {
      return this.client.get<CitationBatch>(`/paper/${paperId}/citations`, {
        params: requestParams,
      });
    });

    return response.data;
  }

  /**
   * Get all citations with pagination
   * @param paperId Semantic Scholar paper ID
   * @param options Optional parameters for max citations and influential filter
   * @returns Array of all citations
   */
  async getAllCitations(
    paperId: string,
    options?: { maxCitations?: number; influentialOnly?: boolean }
  ): Promise<Citation[]> {
    const allCitations: Citation[] = [];
    const maxCits = options?.maxCitations || 500;
    let offset = 0;
    const limit = 100;

    console.log(
      `[SemanticScholar] Fetching citations for paper ${paperId} (max: ${maxCits})`
    );

    while (allCitations.length < maxCits) {
      const batch = await this.getCitations(paperId, { offset, limit });

      if (!batch.data || batch.data.length === 0) {
        break;
      }

      // Filter by influential if requested
      const cits = options?.influentialOnly
        ? batch.data.filter(c => c.isInfluential)
        : batch.data;

      allCitations.push(...cits);

      // Check if there are more pages
      if (batch.next === undefined || batch.next === null) {
        break;
      }

      offset = batch.next;

      // Rate limiting - add small delay between requests
      await this.sleep(100);
    }

    // Trim to maxCitations if needed
    const result = allCitations.slice(0, maxCits);

    console.log(
      `[SemanticScholar] Retrieved ${result.length} citations for paper ${paperId}`
    );

    return result;
  }

  /**
   * Search for a paper by title using the /paper/search/match endpoint
   * Returns the single best matching paper
   *
   * @param title Paper title to search for
   * @param fields Fields to return (optional)
   * @returns Best matching paper or null if not found
   */
  async searchPaperByTitle(
    title: string,
    fields?: string[]
  ): Promise<PaperMatchResponse | null> {
    const defaultFields =
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';
    const requestFields = fields?.join(',') || defaultFields;

    try {
      const response = await this.executeWithRetry(async () => {
        return this.client.get<PaperMatchResponse>('/paper/search/match', {
          params: {
            query: title,
            fields: requestFields,
          },
        });
      });

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      // 404 means no matching paper found
      if (axiosError.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for authors by name using the /author/search endpoint
   *
   * @param name Author name to search for
   * @param options Optional parameters for pagination and fields
   * @returns Author search response with pagination
   */
  async searchAuthors(
    name: string,
    options?: {
      offset?: number;
      limit?: number;
      fields?: string[];
      includePapers?: boolean;
    }
  ): Promise<AuthorSearchResponse> {
    // Default fields for author search
    const defaultFields =
      'authorId,name,affiliations,paperCount,citationCount,hIndex';
    let requestFields = options?.fields?.join(',') || defaultFields;

    // Include papers if requested (with paper details)
    if (options?.includePapers) {
      requestFields +=
        ',papers.paperId,papers.title,papers.abstract,papers.authors,papers.year,papers.citationCount,papers.venue,papers.openAccessPdf';
    }

    const response = await this.executeWithRetry(async () => {
      return this.client.get<AuthorSearchResponse>('/author/search', {
        params: {
          query: name,
          fields: requestFields,
          offset: options?.offset || 0,
          limit: options?.limit || 100,
        },
      });
    });

    return response.data;
  }

  /**
   * Search for papers by author name
   * This is a convenience method that searches for authors and returns their papers
   *
   * @param authorName Author name to search for
   * @param options Optional parameters for pagination and filtering
   * @returns Papers from matching authors
   */
  async searchPapersByAuthor(
    authorName: string,
    options?: {
      limit?: number;
      offset?: number;
      yearFrom?: number;
      yearTo?: number;
      minCitations?: number;
      openAccessOnly?: boolean;
    }
  ): Promise<{ papers: Paper[]; total: number; authors: AuthorWithDetails[] }> {
    // First, search for authors with their papers
    const authorResponse = await this.searchAuthors(authorName, {
      limit: 10, // Get top 10 matching authors
      includePapers: true,
    });

    if (authorResponse.data.length === 0) {
      return { papers: [], total: 0, authors: [] };
    }

    // Collect all papers from matching authors
    const allPapers: Paper[] = [];
    const seenPaperIds = new Set<string>();

    for (const author of authorResponse.data) {
      if (author.papers) {
        for (const paper of author.papers) {
          // Deduplicate papers (same paper might appear for multiple co-authors)
          if (!seenPaperIds.has(paper.paperId)) {
            seenPaperIds.add(paper.paperId);

            // Apply filters
            const yearOk =
              (!options?.yearFrom ||
                (paper.year && paper.year >= options.yearFrom)) &&
              (!options?.yearTo ||
                (paper.year && paper.year <= options.yearTo));
            const citationOk =
              !options?.minCitations ||
              (paper.citationCount &&
                paper.citationCount >= options.minCitations);
            const openAccessOk =
              !options?.openAccessOnly || paper.openAccessPdf?.url;

            if (yearOk && citationOk && openAccessOk) {
              allPapers.push(paper);
            }
          }
        }
      }
    }

    // Sort by citation count (descending)
    allPapers.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 20;
    const paginatedPapers = allPapers.slice(offset, offset + limit);

    return {
      papers: paginatedPapers,
      total: allPapers.length,
      authors: authorResponse.data,
    };
  }
}

/**
 * Singleton instance of Semantic Scholar client
 */
let semanticScholarClient: SemanticScholarClient | null = null;

/**
 * Get or create Semantic Scholar client instance
 */
export function getSemanticScholarClient(): SemanticScholarClient {
  if (!semanticScholarClient) {
    semanticScholarClient = new SemanticScholarClient();
  }
  return semanticScholarClient;
}

/**
 * Create a new Semantic Scholar client with custom API key
 */
export function createSemanticScholarClient(
  apiKey?: string
): SemanticScholarClient {
  return new SemanticScholarClient(apiKey);
}
