/**
 * Gemini Embedding Functions for Custom RAG
 *
 * Provides functions to generate embeddings using Gemini's gemini-embedding-001 model.
 * Supports both single query embeddings and batch document embeddings.
 *
 * Note: gemini-embedding-001 natively outputs 3072 dimensions, but we use MRL
 * (Matryoshka Representation Learning) to output 768 dimensions for backward
 * compatibility with existing pgvector schema.
 */

import { getGeminiClient, withGeminiErrorHandling } from '@/lib/gemini/client';

/** Gemini embedding model name */
const EMBEDDING_MODEL = 'gemini-embedding-001';

/** Maximum texts per batch request (process sequentially but in parallel batches) */
const BATCH_SIZE = 10;

/**
 * Embedding vector dimensions.
 * gemini-embedding-001 supports 768, 1536, or 3072 via MRL.
 * We use 768 for backward compatibility with existing pgvector schema.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Generate embedding for a single query
 *
 * Uses RETRIEVAL_QUERY task type optimized for search queries.
 *
 * @param text - Query text to embed
 * @returns Promise with 768-dimensional embedding vector
 *
 * @example
 * ```typescript
 * const queryEmbedding = await generateQueryEmbedding("What is attention mechanism?");
 * // queryEmbedding is number[] with 768 elements
 * ```
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ parts: [{ text }] }],
      config: {
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });

    if (!response.embeddings?.[0]?.values) {
      throw new Error('No embedding values returned from Gemini API');
    }

    return response.embeddings[0].values;
  });
}

/**
 * Generate embedding for a single document
 *
 * Uses RETRIEVAL_DOCUMENT task type optimized for document indexing.
 *
 * @param text - Document text to embed
 * @returns Promise with 768-dimensional embedding vector
 */
async function generateSingleDocumentEmbedding(
  text: string
): Promise<number[]> {
  const client = getGeminiClient();

  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [{ parts: [{ text }] }],
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });

  if (!response.embeddings?.[0]?.values) {
    throw new Error('No embedding values returned from Gemini API');
  }

  return response.embeddings[0].values;
}

/**
 * Generate embeddings for multiple documents in batches
 *
 * Uses RETRIEVAL_DOCUMENT task type optimized for document indexing.
 * Processes texts in parallel batches to improve performance while
 * respecting API rate limits.
 *
 * @param texts - Array of document texts to embed
 * @returns Promise with array of 768-dimensional embedding vectors
 *
 * @example
 * ```typescript
 * const chunks = ["chunk 1 text", "chunk 2 text", ...];
 * const embeddings = await generateDocumentEmbeddings(chunks);
 * // embeddings[i] corresponds to chunks[i]
 * ```
 */
export async function generateDocumentEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  return withGeminiErrorHandling(async () => {
    const embeddings: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

      console.log(
        `[Embeddings] Processing batch ${batchNum}/${totalBatches} (${batch.length} texts)`
      );

      // Process batch in parallel
      const batchEmbeddings = await Promise.all(
        batch.map(text => generateSingleDocumentEmbedding(text))
      );

      embeddings.push(...batchEmbeddings);

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return embeddings;
  });
}

/**
 * Validate embedding dimensions
 *
 * @param embedding - Embedding vector to validate
 * @returns true if embedding has correct dimensions
 */
export function isValidEmbedding(embedding: number[]): boolean {
  return Array.isArray(embedding) && embedding.length === EMBEDDING_DIMENSIONS;
}
