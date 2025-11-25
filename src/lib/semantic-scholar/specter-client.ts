/**
 * SPECTER API Client for Query Embedding Generation
 * API: https://model-apis.semanticscholar.org/specter/v1/invoke
 *
 * Used to generate embeddings for user queries that can be compared
 * with paper embeddings from Semantic Scholar API for re-ranking.
 */

import axios, { AxiosError } from 'axios';
import { createHash } from 'crypto';
import { getCache, setCache } from '../redis/client';

const SPECTER_API_URL =
  'https://model-apis.semanticscholar.org/specter/v1/invoke';
const QUERY_CACHE_PREFIX = 'specter:query:';
const QUERY_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const REQUEST_TIMEOUT = 15000; // 15 seconds

/**
 * Input format for SPECTER API
 */
interface SpecterInput {
  paper_id: string;
  title: string;
  abstract: string;
}

/**
 * Response format from SPECTER API
 */
interface SpecterResponse {
  preds: Array<{
    paper_id: string;
    embedding: number[]; // 768-dimensional vector
  }>;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate cache key from query string
 */
function getQueryCacheKey(query: string): string {
  // Normalize query: lowercase, trim, collapse whitespace
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const hash = createHash('md5').update(normalized).digest('hex');
  return `${QUERY_CACHE_PREFIX}${hash}`;
}

/**
 * Execute function with retry logic and exponential backoff
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retryCount = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const axiosError = error as AxiosError;

    // Check if we should retry
    const shouldRetry =
      retryCount < MAX_RETRIES &&
      (axiosError.response?.status === 429 || // Rate limit
        axiosError.response?.status === 503 || // Service unavailable
        axiosError.response?.status === 500 || // Server error
        axiosError.code === 'ECONNABORTED' || // Timeout
        axiosError.code === 'ENOTFOUND' || // Network error
        axiosError.code === 'EAI_AGAIN'); // DNS error

    if (!shouldRetry) {
      throw error;
    }

    // Calculate delay with exponential backoff
    const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
    console.warn(
      `[SPECTER] Retrying API request (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${delay}ms...`
    );

    await sleep(delay);
    return executeWithRetry(fn, retryCount + 1);
  }
}

/**
 * Generate embedding for a user query using SPECTER API
 * Results are cached in Redis for 7 days
 *
 * @param query User query string
 * @returns 768-dimensional embedding vector, or null if generation fails
 */
export async function generateQueryEmbedding(
  query: string
): Promise<number[] | null> {
  if (!query || query.trim().length === 0) {
    console.warn('[SPECTER] Empty query provided');
    return null;
  }

  const cacheKey = getQueryCacheKey(query);

  // 1. Try cache first
  try {
    const cached = await getCache<number[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length === 768) {
      console.log('[SPECTER] Query embedding cache hit');
      return cached;
    }
  } catch (cacheError) {
    console.warn('[SPECTER] Cache read failed:', cacheError);
    // Continue to API call
  }

  console.log('[SPECTER] Cache miss, generating query embedding...');

  // 2. Call SPECTER API
  try {
    const input: SpecterInput[] = [
      {
        paper_id: 'query',
        title: query,
        abstract: '', // Empty abstract for query embedding
      },
    ];

    const response = await executeWithRetry(async () => {
      return axios.post<SpecterResponse>(SPECTER_API_URL, input, {
        timeout: REQUEST_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    const embedding = response.data?.preds?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      console.error('[SPECTER] Invalid response format: no embedding found');
      return null;
    }

    if (embedding.length !== 768) {
      console.error(
        `[SPECTER] Unexpected embedding dimension: ${embedding.length} (expected 768)`
      );
      return null;
    }

    // 3. Cache the result
    try {
      await setCache(cacheKey, embedding, QUERY_CACHE_TTL);
      console.log('[SPECTER] Query embedding cached successfully');
    } catch (cacheError) {
      console.warn('[SPECTER] Cache write failed:', cacheError);
      // Don't fail - we still have the embedding
    }

    return embedding;
  } catch (error) {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      console.error(
        `[SPECTER] API error: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`
      );
    } else if (axiosError.code) {
      console.error(`[SPECTER] Network error: ${axiosError.code}`);
    } else {
      console.error('[SPECTER] Unknown error:', error);
    }

    return null; // Return null to trigger fallback
  }
}
