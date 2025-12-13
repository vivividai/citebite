/**
 * Text Chunker for Custom RAG
 *
 * Splits extracted PDF text into overlapping fixed-size chunks for embedding.
 * Supports figure reference extraction for multimodal RAG.
 */

import { extractAllFigureReferences } from '@/lib/pdf/figure-reference-extractor';

export interface ChunkConfig {
  /** Maximum characters per chunk */
  maxChars: number;
  /** Overlap between consecutive chunks */
  overlapChars: number;
  /** Minimum characters required for a valid chunk */
  minChars: number;
}

export interface Chunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

/**
 * Extended chunk with figure references for multimodal RAG
 */
export interface ChunkWithFigureRefs extends Chunk {
  /** Array of figure numbers referenced in this chunk (e.g., ["Figure 1", "Table 2"]) */
  referencedFigures: string[];
}

/**
 * Default chunking configuration (optimized for research papers)
 *
 * - 4096 chars ≈ 1024 tokens (optimal for academic content per NVIDIA research)
 * - 600 char overlap ≈ 150 tokens (15% overlap - best performing in benchmarks)
 * - 100 char minimum prevents tiny fragments
 */
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxChars: 4096,
  overlapChars: 600,
  minChars: 100,
};

/**
 * Chunk text into overlapping fixed-size segments
 *
 * Features:
 * - Fixed-size chunks with configurable overlap
 * - Filters out chunks below minimum size
 *
 * @param text - Full text to chunk
 * @param config - Chunking configuration (optional)
 * @returns Array of chunks with content, index, and estimated token count
 *
 * @example
 * ```typescript
 * const chunks = chunkText(extractedPdfText);
 * console.log(`Created ${chunks.length} chunks`);
 * ```
 */
export function chunkText(
  text: string,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  // Handle empty or very short text
  if (!text || text.length < config.minChars) {
    if (text && text.trim().length > 0) {
      return [
        {
          content: text.trim(),
          chunkIndex: 0,
          tokenCount: estimateTokens(text),
        },
      ];
    }
    return [];
  }

  while (start < text.length) {
    const end = Math.min(start + config.maxChars, text.length);
    const content = text.slice(start, end).trim();

    // Only add chunk if it meets minimum size
    if (content.length >= config.minChars) {
      chunks.push({
        content,
        chunkIndex,
        tokenCount: estimateTokens(content),
      });
      chunkIndex++;
    }

    // Calculate next start position with overlap
    // If we're near the end, just finish
    const nextStart = end - config.overlapChars;
    if (nextStart >= text.length || nextStart <= start) {
      break;
    }
    start = nextStart;
  }

  return chunks;
}

/**
 * Estimate token count from text
 *
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is an approximation - actual tokenization varies by model.
 */
export function estimateTokens(text: string): number {
  // Average 4 characters per token for English
  // This is a rough estimate; Gemini's actual tokenization may differ
  return Math.ceil(text.length / 4);
}

/**
 * Get total token count for an array of chunks
 */
export function getTotalTokenCount(chunks: Chunk[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
}

/**
 * Chunk text with figure reference extraction for multimodal RAG
 *
 * This extends the basic chunking with figure reference parsing.
 * Each chunk will include an array of normalized figure references found in its content.
 *
 * @param text - Full text to chunk
 * @param config - Chunking configuration (optional)
 * @returns Array of chunks with content, index, token count, and referenced figures
 *
 * @example
 * ```typescript
 * const chunks = chunkTextWithFigureRefs(extractedPdfText);
 * chunks.forEach(chunk => {
 *   if (chunk.referencedFigures.length > 0) {
 *     console.log(`Chunk ${chunk.chunkIndex} references: ${chunk.referencedFigures.join(', ')}`);
 *   }
 * });
 * ```
 */
export function chunkTextWithFigureRefs(
  text: string,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): ChunkWithFigureRefs[] {
  const basicChunks = chunkText(text, config);

  return basicChunks.map(chunk => ({
    ...chunk,
    referencedFigures: extractAllFigureReferences(chunk.content),
  }));
}
