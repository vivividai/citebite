/**
 * SPECTER2 API Client
 *
 * Client for Semantic Scholar's SPECTER2 embedding model
 * Used for semantic paper similarity and hybrid search
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { getSemanticScholarClient } from './client';
import {
  SpecterEmbeddingRequest,
  SpecterEmbeddingResponse,
  BatchEmbeddingResult,
} from './specter-types';
import { getCache, setCache } from '../redis/client';

// HuggingFace Inference API for Sentence Transformers
// Note: SPECTER2 is not deployed by HuggingFace Inference API
// Using all-MiniLM-L6-v2 as alternative (general-purpose embeddings, 384 dimensions)
const HUGGINGFACE_API_URL = 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';
const HUGGINGFACE_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN;

// Dimension changed from 768 (SPECTER2) to 384 (all-MiniLM-L6-v2)
const EMBEDDING_DIMENSION = 384;
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const BATCH_SIZE = 100; // Process 100 papers at a time
const BATCH_DELAY_MS = 100; // 100ms delay between batches

export class SpecterClient {
  private huggingfaceClient: AxiosInstance;

  constructor() {
    if (!HUGGINGFACE_API_TOKEN) {
      console.warn('[SpecterClient] HUGGINGFACE_API_TOKEN not set. Query embeddings will fail.');
    }

    this.huggingfaceClient = axios.create({
      baseURL: HUGGINGFACE_API_URL,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUGGINGFACE_API_TOKEN}`,
      },
    });
  }

  /**
   * Generate embedding for a query text using HuggingFace Inference API
   * @param query - Search query or paper title
   * @param abstract - Optional abstract text for better embedding
   * @returns 768-dimensional embedding vector
   */
  async embedQuery(query: string, abstract?: string): Promise<number[]> {
    console.log('[SpecterClient] Generating query embedding via HuggingFace');

    if (!HUGGINGFACE_API_TOKEN) {
      throw new Error('HUGGINGFACE_API_TOKEN is not configured. Please add it to .env.local');
    }

    // SPECTER2 expects "[title] [SEP] [abstract]" format
    const text = abstract ? `${query} [SEP] ${abstract}` : query;

    try {
      const response = await this.executeWithRetry<number[]>(
        async () => {
          // HuggingFace Inference API accepts raw text
          return this.huggingfaceClient.post<number[]>('', {
            inputs: text,
            options: {
              wait_for_model: true, // Wait if model is loading
            },
          });
        }
      );

      const embedding = response.data;

      // HuggingFace returns the embedding directly
      if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding?.length || 0}`
        );
      }

      console.log('[SpecterClient] Query embedding generated successfully via HuggingFace');
      return embedding;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('[SpecterClient] Failed to generate query embedding:', {
        message: axiosError.message,
        status: axiosError.response?.status,
        data: axiosError.response?.data,
      });

      if (axiosError.response?.status === 401) {
        throw new Error('Invalid HUGGINGFACE_API_TOKEN. Please check your API token.');
      }

      if (axiosError.response?.status === 503) {
        throw new Error('SPECTER2 model is loading on HuggingFace. Please try again in a few seconds.');
      }

      throw new Error('Failed to generate query embedding');
    }
  }

  /**
   * Get embeddings for multiple papers (with caching and batching)
   * @param paperIds - Array of Semantic Scholar paper IDs
   * @returns Map of paperId to embedding vector
   */
  async getPaperEmbeddings(paperIds: string[]): Promise<BatchEmbeddingResult> {
    console.log(`[SpecterClient] Fetching embeddings for ${paperIds.length} papers`);

    const successful = new Map<string, number[]>();
    const failed: string[] = [];

    // Check cache first
    const uncachedIds: string[] = [];
    for (const paperId of paperIds) {
      const cached = await this.getCachedEmbedding(paperId);
      if (cached) {
        successful.set(paperId, cached);
      } else {
        uncachedIds.push(paperId);
      }
    }

    if (uncachedIds.length === 0) {
      console.log('[SpecterClient] All embeddings found in cache');
      return { successful, failed };
    }

    console.log(
      `[SpecterClient] ${successful.size} cached, ${uncachedIds.length} to fetch`
    );

    // Fetch uncached embeddings in batches
    const batches = this.chunkArray(uncachedIds, BATCH_SIZE);
    const semanticScholarClient = getSemanticScholarClient();

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(
        `[SpecterClient] Processing batch ${i + 1}/${batches.length} (${batch.length} papers)`
      );

      try {
        // Fetch papers with embedding field
        const papers = await semanticScholarClient.getPapersBatch(batch, [
          'paperId',
          'embedding.specter_v2',
        ]);

        for (const paper of papers) {
          const embedding = (paper as any).embedding?.specter_v2;

          if (embedding && Array.isArray(embedding) && embedding.length === EMBEDDING_DIMENSION) {
            successful.set(paper.paperId, embedding);
            await this.cacheEmbedding(paper.paperId, embedding);
          } else {
            console.warn(`[SpecterClient] Invalid embedding for paper ${paper.paperId}`);
            failed.push(paper.paperId);
          }
        }

        // Rate limiting: delay between batches
        if (i < batches.length - 1) {
          await this.delay(BATCH_DELAY_MS);
        }
      } catch (error) {
        console.error(`[SpecterClient] Failed to fetch batch ${i + 1}:`, error);
        failed.push(...batch);
      }
    }

    console.log(
      `[SpecterClient] Embedding fetch complete: ${successful.size} successful, ${failed.length} failed`
    );

    return { successful, failed };
  }

  /**
   * Compute cosine similarity between two vectors
   * @param vecA - First vector
   * @param vecB - Second vector
   * @returns Cosine similarity (0-1, higher is more similar)
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Get cached embedding for a paper
   */
  private async getCachedEmbedding(paperId: string): Promise<number[] | null> {
    try {
      const cacheKey = `specter:${paperId}`;
      const cached = await getCache<number[]>(cacheKey);
      return cached || null;
    } catch (error) {
      console.warn(`[SpecterClient] Cache read failed for ${paperId}:`, error);
      return null;
    }
  }

  /**
   * Cache embedding for a paper
   */
  private async cacheEmbedding(paperId: string, embedding: number[]): Promise<void> {
    try {
      const cacheKey = `specter:${paperId}`;
      await setCache(cacheKey, embedding, CACHE_TTL);
    } catch (error) {
      console.warn(`[SpecterClient] Cache write failed for ${paperId}:`, error);
    }
  }

  /**
   * Execute a request with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<{ data: T }>,
    maxRetries = 3,
    initialDelay = 1000
  ): Promise<{ data: T }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;

        // Don't retry on client errors (4xx except 429)
        if (axiosError.response?.status && axiosError.response.status >= 400 && axiosError.response.status < 500 && axiosError.response.status !== 429) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(
          `[SpecterClient] Request failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms:`,
          axiosError.message
        );

        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let specterClientInstance: SpecterClient | null = null;

export function getSpecterClient(): SpecterClient {
  if (!specterClientInstance) {
    specterClientInstance = new SpecterClient();
  }
  return specterClientInstance;
}
