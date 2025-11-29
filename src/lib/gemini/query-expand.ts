/**
 * Query Expansion for Re-ranking
 *
 * Expands short user queries/keywords into richer descriptions
 * optimized for SPECTER embedding generation.
 *
 * This is separate from query-transform.ts which handles chat queries
 * with conversation context and sub-query decomposition.
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';

/**
 * Result of query expansion
 */
export interface QueryExpansionResult {
  expandedQuery: string;
  originalQuery: string;
}

/**
 * Prompt for query expansion (optimized for SPECTER embeddings)
 */
const QUERY_EXPANSION_PROMPT = `You are an expert at expanding search queries for academic paper retrieval.

Given a user's search query or topic description, expand it into a rich, detailed description suitable for semantic similarity matching with academic papers.

## Guidelines
- Expand abbreviations and acronyms
- Add relevant related concepts and terminology
- Use academic/scientific language
- Keep the expansion focused on the original topic (don't drift)
- Output should be 1-3 sentences, similar in length to a paper abstract
- Do NOT add questions or request formats - output a descriptive statement

## Examples

Input: "transformer attention"
Output: "Self-attention mechanisms in transformer neural network architectures for deep learning, natural language processing, and sequence-to-sequence modeling tasks."

Input: "GNN node classification"
Output: "Graph neural networks for semi-supervised node classification tasks, including message passing, neighborhood aggregation, and graph convolutional approaches for learning node representations."

Input: "BERT fine-tuning NLP"
Output: "Fine-tuning pre-trained BERT language models for downstream natural language processing tasks including text classification, named entity recognition, and question answering."

## Output Format
Return ONLY the expanded query text, nothing else. No JSON, no markdown, no explanation.`;

/**
 * Expand a short query into a richer description for SPECTER embedding
 *
 * Used during collection creation to improve re-ranking accuracy.
 * Short keywords are expanded into abstract-length descriptions that
 * better match the format SPECTER was trained on.
 *
 * @param query - User's original search query or keywords
 * @returns Expanded query optimized for embedding
 */
export async function expandQueryForReranking(
  query: string
): Promise<QueryExpansionResult> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    console.warn('[QueryExpand] Empty query provided');
    return {
      expandedQuery: '',
      originalQuery: query,
    };
  }

  // Skip expansion for already long queries (likely already descriptive)
  const wordCount = trimmedQuery.split(/\s+/).length;
  if (wordCount > 20) {
    console.log(
      `[QueryExpand] Query already long (${wordCount} words), skipping expansion`
    );
    return {
      expandedQuery: trimmedQuery,
      originalQuery: query,
    };
  }

  const startTime = Date.now();
  console.log('[QueryExpand] ──────────────────────────────────────────');
  console.log(`[QueryExpand] 📝 Original query: "${trimmedQuery}"`);
  console.log('[QueryExpand] 🔄 Expanding for SPECTER embedding...');

  const client = getGeminiClient();

  try {
    const result = await withGeminiErrorHandling(async () => {
      const response = await client.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user' as const,
            parts: [
              {
                text: `${QUERY_EXPANSION_PROMPT}\n\nInput: "${trimmedQuery}"\nOutput:`,
              },
            ],
          },
        ],
        config: {
          temperature: 0.3, // Low temperature for consistent output
          maxOutputTokens: 200, // Short output expected
        },
      });

      const text =
        response.candidates?.[0]?.content?.parts?.[0]?.text ||
        'No response generated';
      return text.trim();
    });

    const elapsed = Date.now() - startTime;

    // Clean up the result (remove quotes if present)
    const cleanedResult = result.replace(/^["']|["']$/g, '').trim();

    console.log(`[QueryExpand] ✓ Expanded query: "${cleanedResult}"`);
    console.log(`[QueryExpand] ⏱️ Completed in ${elapsed}ms`);

    return {
      expandedQuery: cleanedResult,
      originalQuery: query,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error('[QueryExpand] ✗ Expansion failed:', error);
    console.log(`[QueryExpand] ⚠️ Using original query as fallback`);
    console.log(`[QueryExpand] ⏱️ Failed after ${elapsed}ms`);

    // Fallback to original query
    return {
      expandedQuery: trimmedQuery,
      originalQuery: query,
    };
  }
}
