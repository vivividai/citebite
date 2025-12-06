/**
 * Evaluation Metrics
 *
 * Implements F1 Score and Exact Match calculations
 * following the SQuAD evaluation methodology.
 */

import { QuestionMetrics, AnswerType } from './types';

/**
 * Normalize text for comparison
 * - Lowercase
 * - Remove punctuation
 * - Collapse whitespace
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

/**
 * Tokenize text into words
 */
export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.split(' ').filter(token => token.length > 0);
}

/**
 * Count overlapping tokens between two token arrays
 */
function countOverlap(tokens1: string[], tokens2: string[]): number {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let overlap = 0;
  for (const token of set1) {
    if (set2.has(token)) {
      overlap++;
    }
  }
  return overlap;
}

/**
 * Calculate token-level F1 score between predicted and reference text
 *
 * F1 = 2 * (precision * recall) / (precision + recall)
 * where:
 *   precision = overlap / predicted_tokens
 *   recall = overlap / reference_tokens
 *
 * @returns F1 score between 0 and 1
 */
export function calculateF1(predicted: string, reference: string): number {
  const predTokens = tokenize(predicted);
  const refTokens = tokenize(reference);

  if (predTokens.length === 0 && refTokens.length === 0) {
    return 1.0; // Both empty = perfect match
  }
  if (predTokens.length === 0 || refTokens.length === 0) {
    return 0.0; // One empty = no match
  }

  const overlap = countOverlap(predTokens, refTokens);

  if (overlap === 0) {
    return 0.0;
  }

  const precision = overlap / predTokens.length;
  const recall = overlap / refTokens.length;

  return (2 * precision * recall) / (precision + recall);
}

/**
 * Calculate exact match (normalized)
 *
 * @returns 1 if normalized strings match, 0 otherwise
 */
export function calculateExactMatch(
  predicted: string,
  reference: string
): number {
  return normalizeText(predicted) === normalizeText(reference) ? 1.0 : 0.0;
}

/**
 * Evaluate predicted answer against multiple reference answers
 * Returns the best score across all references
 *
 * This is the standard approach in QA evaluation -
 * if any annotator's answer matches, it's considered correct.
 *
 * @param predicted - Model's predicted answer
 * @param references - Array of reference answers from annotators
 * @returns Best F1 and EM scores
 */
export function evaluateWithReferences(
  predicted: string,
  references: string[]
): QuestionMetrics {
  if (references.length === 0) {
    return { f1: 0, exactMatch: 0 };
  }

  let maxF1 = 0;
  let maxEM = 0;

  for (const ref of references) {
    const f1 = calculateF1(predicted, ref);
    const em = calculateExactMatch(predicted, ref);

    maxF1 = Math.max(maxF1, f1);
    maxEM = Math.max(maxEM, em);
  }

  return { f1: maxF1, exactMatch: maxEM };
}

/**
 * Check if predicted answer indicates "unanswerable"
 */
export function isUnanswerablePrediction(predicted: string): boolean {
  const lower = predicted.toLowerCase();
  const patterns = [
    "couldn't find",
    'could not find',
    'not found',
    "don't have",
    'no information',
    'not mentioned',
    'not covered',
    'not available',
    'unable to find',
    "isn't covered",
    'is not covered',
    "doesn't contain",
    'does not contain',
    'unanswerable',
    "i don't know",
  ];

  return patterns.some(pattern => lower.includes(pattern));
}

/**
 * Check if predicted answer matches yes/no expected answer
 */
export function evaluateYesNo(
  predicted: string,
  expectedYes: boolean
): QuestionMetrics {
  const lower = predicted.toLowerCase();

  // Check for explicit yes/no
  const hasYes = /\byes\b/.test(lower);
  const hasNo = /\bno\b/.test(lower);

  let isCorrect = false;

  if (expectedYes) {
    // Expected "yes" - check if answer affirms
    isCorrect = hasYes && !hasNo;
  } else {
    // Expected "no" - check if answer negates
    isCorrect = hasNo && !hasYes;
  }

  // If no clear yes/no, try to detect affirmative/negative sentiment
  if (!hasYes && !hasNo) {
    const affirmative = ['correct', 'true', 'indeed', 'certainly'];
    const negative = ['incorrect', 'false', 'not', "doesn't", "don't"];

    const hasAffirmative = affirmative.some(word => lower.includes(word));
    const hasNegative = negative.some(word => lower.includes(word));

    if (expectedYes) {
      isCorrect = hasAffirmative && !hasNegative;
    } else {
      isCorrect = hasNegative && !hasAffirmative;
    }
  }

  return {
    f1: isCorrect ? 1.0 : 0.0,
    exactMatch: isCorrect ? 1.0 : 0.0,
  };
}

/**
 * Evaluate based on answer type
 */
export function evaluateByType(
  predicted: string,
  references: string[],
  answerType: AnswerType,
  expectedYesNo?: boolean | null
): QuestionMetrics {
  switch (answerType) {
    case 'unanswerable':
      // Check if model correctly identified as unanswerable
      const detected = isUnanswerablePrediction(predicted);
      return {
        f1: detected ? 1.0 : 0.0,
        exactMatch: detected ? 1.0 : 0.0,
      };

    case 'yes_no':
      if (expectedYesNo !== null && expectedYesNo !== undefined) {
        return evaluateYesNo(predicted, expectedYesNo);
      }
      // Fallback to text comparison
      return evaluateWithReferences(predicted, references);

    case 'extractive':
    case 'abstractive':
    default:
      return evaluateWithReferences(predicted, references);
  }
}

/**
 * Strip citation markers from RAG response
 * e.g., "[CITE:1]" → ""
 */
export function stripCitations(text: string): string {
  return text
    .replace(/\[CITE:\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
