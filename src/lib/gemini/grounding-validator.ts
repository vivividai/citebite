/**
 * Grounding metadata validation for RAG responses
 *
 * Validates that Gemini responses include proper grounding metadata
 * (citations) and calculates quality scores.
 */

import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';

/**
 * Result of grounding metadata validation
 */
export interface ValidationResult {
  /** Whether the response has valid grounding (at least 1 chunk) */
  isValid: boolean;
  /** Number of grounding chunks (source passages) */
  chunkCount: number;
  /** Number of supports (text segment to chunk mappings) */
  supportCount: number;
  /** Quality score from 0-1 based on source diversity and coverage */
  qualityScore: number;
}

/**
 * Validate grounding metadata quality
 *
 * Calculates a quality score based on:
 * - Source diversity: More unique sources = higher score (up to 5)
 * - Coverage: How much of the answer is backed by citations
 *
 * @param chunks - Grounding chunks from Gemini response
 * @param supports - Grounding supports (text segment mappings)
 * @param answerLength - Length of the answer text
 * @returns Validation result with quality metrics
 *
 * @example
 * ```typescript
 * const result = validateGroundingMetadata(chunks, supports, answer.length);
 * if (!result.isValid) {
 *   // Retry with different prompt
 * }
 * ```
 */
export function validateGroundingMetadata(
  chunks: GroundingChunk[],
  supports: GroundingSupport[],
  answerLength: number
): ValidationResult {
  const chunkCount = chunks.length;
  const supportCount = supports.length;

  // Calculate quality score
  let qualityScore = 0;

  if (chunkCount > 0) {
    // Factor 1: Source diversity (more sources = better, up to 5)
    // Score: 0.0 for 0 sources, 0.2 for 1 source, 1.0 for 5+ sources
    const sourceScore = Math.min(chunkCount / 5, 1.0);

    // Factor 2: Coverage of answer text by supports
    let coverageScore = 0.3; // Base score if we have chunks but no supports

    if (supportCount > 0 && answerLength > 0) {
      // Calculate total characters covered by citations
      const totalCovered = supports.reduce((sum, s) => {
        const start = s.segment.startIndex || 0;
        const end = s.segment.endIndex || 0;
        return sum + (end - start);
      }, 0);

      // Coverage ratio (capped at 1.0)
      coverageScore = Math.min(totalCovered / answerLength, 1.0);
    }

    // Weighted average: 40% source diversity, 60% coverage
    qualityScore = sourceScore * 0.4 + coverageScore * 0.6;
  }

  return {
    isValid: chunkCount > 0,
    chunkCount,
    supportCount,
    qualityScore,
  };
}
