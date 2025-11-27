/**
 * Response Synthesis for Query Transformation Pipeline
 *
 * Combines answers from multiple sub-queries into a coherent response.
 * Merges all grounding chunks with proper index adjustment.
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';
import { ChatResponse } from './chat';
import { SubQueryResult } from './parallel-rag';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';

/**
 * System prompt for synthesis
 */
const SYNTHESIS_SYSTEM_PROMPT = `You are CiteBite, an AI research assistant synthesizing research information into a coherent answer.

You will receive answers from multiple sub-queries about the user's question. Your task is to:
1. Integrate all relevant information without redundancy
2. Structure the response logically (overview → details → implications)
3. Preserve important details and findings
4. Be comprehensive but concise

## Guidelines
- Do NOT add information beyond what was found in the sub-query answers
- Prioritize information that appears in multiple sub-query answers
- If sub-queries found conflicting information, present both perspectives
- Focus on answering the original question directly
- Keep the synthesis to a reasonable length (not too long)`;

/**
 * Build synthesis prompt with sub-query results
 */
function buildSynthesisPrompt(
  originalQuestion: string,
  subQueryResults: SubQueryResult[]
): string {
  const subQuerySection = subQueryResults
    .filter(r => r.success && r.answer.trim().length > 0)
    .map(
      (r, i) => `### Sub-Query ${i + 1}: ${r.subQuery}
${r.answer}`
    )
    .join('\n\n');

  return `## Original Question
"${originalQuestion}"

## Information from Sub-Queries
${subQuerySection}

## Your Task
Synthesize the above information into a coherent, well-structured answer to the original question. Focus on directly answering what was asked.`;
}

/**
 * Merge grounding data from multiple sub-query results
 *
 * Combines all chunks and adjusts support indices to account for
 * the offset from previous results.
 *
 * @param results - Successful sub-query results
 * @returns Combined chunks and supports with adjusted indices
 */
export function mergeGroundingData(results: SubQueryResult[]): {
  allChunks: GroundingChunk[];
  allSupports: GroundingSupport[];
} {
  const allChunks: GroundingChunk[] = [];
  const allSupports: GroundingSupport[] = [];
  let chunkOffset = 0;

  for (const result of results) {
    if (!result.success) continue;

    // Add all chunks from this result
    allChunks.push(...result.groundingChunks);

    // Add supports with adjusted chunk indices
    for (const support of result.groundingSupports) {
      allSupports.push({
        segment: support.segment,
        groundingChunkIndices: support.groundingChunkIndices.map(
          idx => idx + chunkOffset
        ),
      });
    }

    // Update offset for next result
    chunkOffset += result.groundingChunks.length;
  }

  return { allChunks, allSupports };
}

/**
 * Synthesize multiple sub-query answers into a single coherent response
 *
 * Uses Gemini (without File Search) to combine the answers.
 * Merges all grounding chunks from sub-queries.
 *
 * @param originalQuestion - The user's original question
 * @param subQueryResults - Results from parallel sub-query execution
 * @returns ChatResponse with synthesized answer and merged grounding data
 */
export async function synthesizeResponses(
  originalQuestion: string,
  subQueryResults: SubQueryResult[]
): Promise<ChatResponse> {
  const startTime = Date.now();

  console.log('\n[Synthesis] ──────────────────────────────────────────');
  console.log('[Synthesis] Step 3: Response Synthesis');
  console.log('[Synthesis] ──────────────────────────────────────────');

  // Filter to successful results only
  const successfulResults = subQueryResults.filter(r => r.success);

  if (successfulResults.length === 0) {
    console.error(
      '[Synthesis] ✗ No successful sub-query results to synthesize'
    );
    throw new Error('No successful sub-query results to synthesize');
  }

  console.log(
    `[Synthesis] 📥 Input: ${successfulResults.length} successful sub-query answers`
  );

  // Log each successful result summary
  successfulResults.forEach((r, i) => {
    const answerPreview = r.answer.substring(0, 100).replace(/\n/g, ' ');
    console.log(
      `[Synthesis]   ├─ [${i + 1}] ${r.groundingChunks.length} chunks, ${r.answer.length} chars: "${answerPreview}..."`
    );
  });

  // Merge grounding data from all results
  const { allChunks, allSupports } = mergeGroundingData(successfulResults);

  console.log(
    `[Synthesis] 🔗 Merged grounding: ${allChunks.length} chunks, ${allSupports.length} supports`
  );

  // Build synthesis prompt
  const prompt = buildSynthesisPrompt(originalQuestion, successfulResults);
  const promptLength = prompt.length;
  console.log(`[Synthesis] 📝 Synthesis prompt length: ${promptLength} chars`);
  console.log(
    '[Synthesis] 🔄 Calling Gemini for synthesis (no File Search)...'
  );

  // Call Gemini for synthesis (no File Search)
  const client = getGeminiClient();

  const result = await withGeminiErrorHandling(async () => {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user' as const,
          parts: [{ text: prompt }],
        },
      ],
      config: {
        systemInstruction: SYNTHESIS_SYSTEM_PROMPT,
        temperature: 0.3, // Slightly higher for more natural synthesis
      },
    });

    return (
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Failed to generate synthesis'
    );
  });

  const elapsed = Date.now() - startTime;

  console.log('[Synthesis] ✓ Synthesis complete');
  console.log(`[Synthesis] 📊 Output: ${result.length} chars`);
  console.log(`[Synthesis] ⏱️ Step 3 completed in ${elapsed}ms`);

  return {
    answer: result,
    groundingChunks: allChunks,
    groundingSupports: allSupports,
  };
}

/**
 * Get the best single sub-query answer as fallback
 *
 * Used when synthesis fails - returns the most complete answer.
 *
 * @param results - Sub-query results
 * @returns ChatResponse from the best available result
 */
export function getBestSubQueryAnswer(results: SubQueryResult[]): ChatResponse {
  // Sort by success, then by number of grounding chunks
  const sorted = [...results]
    .filter(r => r.success)
    .sort((a, b) => {
      // Prefer results with more grounding chunks
      const chunkDiff = b.groundingChunks.length - a.groundingChunks.length;
      if (chunkDiff !== 0) return chunkDiff;

      // Then by answer length (longer = more detailed)
      return b.answer.length - a.answer.length;
    });

  if (sorted.length === 0) {
    return {
      answer: 'I was unable to find relevant information in the papers.',
      groundingChunks: [],
      groundingSupports: [],
    };
  }

  const best = sorted[0];
  return {
    answer: best.answer,
    groundingChunks: best.groundingChunks,
    groundingSupports: best.groundingSupports,
  };
}
