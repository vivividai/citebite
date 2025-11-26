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
