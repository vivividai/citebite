/**
 * Text Chunker for Custom RAG
 *
 * Splits extracted PDF text into overlapping chunks for embedding.
 * Uses fixed-size chunking with sentence boundary awareness.
 */

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
 * Default chunking configuration
 *
 * - 1000 chars ≈ 250 tokens (good for embedding models)
 * - 200 char overlap ensures context continuity
 * - 100 char minimum prevents tiny fragments
 */
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxChars: 1000,
  overlapChars: 200,
  minChars: 100,
};

/**
 * Chunk text into overlapping segments
 *
 * Features:
 * - Fixed-size chunks with configurable overlap
 * - Attempts to break at sentence boundaries
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
    let end = Math.min(start + config.maxChars, text.length);

    // Try to break at sentence boundary if not at end of text
    if (end < text.length) {
      const sentenceEnd = findSentenceBoundary(
        text,
        start,
        end,
        config.minChars
      );
      if (sentenceEnd > 0) {
        end = sentenceEnd;
      }
    }

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
 * Find the best sentence boundary within a range
 *
 * Looks for sentence-ending punctuation (. ? !) followed by space or newline.
 * Returns the position after the punctuation, or -1 if no boundary found.
 */
function findSentenceBoundary(
  text: string,
  start: number,
  end: number,
  minChars: number
): number {
  // Search backwards from end to find sentence boundary
  // Only search in the last 30% of the chunk to avoid too-small chunks
  const searchStart = Math.max(
    start + minChars,
    end - Math.floor((end - start) * 0.3)
  );

  for (let i = end; i >= searchStart; i--) {
    const char = text[i];
    const prevChar = text[i - 1];

    // Check for sentence ending: punctuation followed by space/newline
    if (
      (prevChar === '.' || prevChar === '?' || prevChar === '!') &&
      (char === ' ' || char === '\n' || char === '\r')
    ) {
      return i;
    }
  }

  return -1;
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
