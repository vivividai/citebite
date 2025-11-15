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
   */
  private buildQuery(params: SearchParams): string {
    let query = params.keywords;

    // Add year filter if specified
    if (params.yearFrom || params.yearTo) {
      const yearFrom = params.yearFrom || 1900;
      const yearTo = params.yearTo || new Date().getFullYear();
      query += ` year:${yearFrom}-${yearTo}`;
    }

    // Add citation count filter if specified
    if (params.minCitations !== undefined) {
      query += ` citationCount:>${params.minCitations}`;
    }

    return query;
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
    const fields =
      params.fields?.join(',') ||
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';

    const requestParams: Record<string, string | number> = {
      query,
      fields,
      limit: params.limit || 100,
      offset: params.offset || 0,
    };

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
   * @param paperIds Array of Semantic Scholar paper IDs
   * @param fields Fields to return (optional)
   * @returns Array of papers
   */
  async getPapersBatch(
    paperIds: string[],
    fields?: string[]
  ): Promise<Paper[]> {
    const requestFields =
      fields?.join(',') ||
      'paperId,title,abstract,authors,year,citationCount,venue,publicationTypes,openAccessPdf,externalIds';

    const response = await this.executeWithRetry(async () => {
      return this.client.post<Paper[]>(
        '/paper/batch',
        { ids: paperIds },
        {
          params: { fields: requestFields },
        }
      );
    });

    return response.data;
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
