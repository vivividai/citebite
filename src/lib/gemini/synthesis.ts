/**
 * Response Synthesis for Query Transformation Pipeline
 *
 * Combines answers from multiple sub-queries into a coherent response.
 * Uses LLM Citation Markers ([CITE:N]) for grounding instead of File Search re-call.
 *
 * Why LLM Citation Markers?
 * - Sub-queries return 50-75 chunks total, but File Search re-call returns only 0-5 chunks
 * - LLM can accurately place [CITE:N] markers which we parse with regex (100% accuracy)
 * - No additional LLM calls needed for post-hoc mapping
 * - Eliminates File Search latency (~4-5s) in synthesis step
 */

import { getGeminiClient, withGeminiErrorHandling } from './client';
import { ChatResponse } from './chat';
import { SubQueryResult } from './parallel-rag';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';

/**
 * Parsed citation from LLM response
 */
interface ParsedCitation {
  startIndex: number;
  endIndex: number;
  chunkIndices: number[];
}

/**
 * System prompt for synthesis with LLM citation markers
 */
const SYNTHESIS_SYSTEM_PROMPT_WITH_CITATIONS = `You are CiteBite, an AI research assistant synthesizing research information into a coherent answer.

## CITATION FORMAT (CRITICAL)
You MUST cite sources using [CITE:N] where N is the source index (0-based).
- Place [CITE:N] IMMEDIATELY after any claim that uses information from the sources
- Multiple sources: [CITE:1,3,5]
- Every factual statement MUST have at least one citation
- Do NOT make claims without citing a source

Example:
"Memristor devices exhibit significant variability in their switching behavior [CITE:0]. This variability affects classification accuracy in neuromorphic systems [CITE:2,4]."

## Guidelines
- Structure: overview → details → implications
- Integrate information without redundancy
- If sources conflict, present both perspectives with their respective citations
- Be comprehensive but concise
- Focus on directly answering the original question
- NEVER include information that isn't supported by the provided sources`;

/**
 * Aggregate chunks from all sub-query results with deduplication
 *
 * @param subQueryResults - Results from parallel sub-query execution
 * @returns Deduplicated chunks and total count from sub-queries
 */
function aggregateChunks(subQueryResults: SubQueryResult[]): {
  chunks: GroundingChunk[];
  totalFromSubQueries: number;
} {
  const seenTexts = new Set<string>();
  const chunks: GroundingChunk[] = [];
  let total = 0;

  for (const result of subQueryResults) {
    if (!result.success) continue;
    total += result.groundingChunks.length;

    for (const chunk of result.groundingChunks) {
      const text = chunk.retrievedContext?.text || '';
      // Use first 200 chars as fingerprint for deduplication
      const fingerprint = text.slice(0, 200).trim();

      if (text.length > 0 && !seenTexts.has(fingerprint)) {
        seenTexts.add(fingerprint);
        chunks.push(chunk);
      }
    }
  }

  return { chunks, totalFromSubQueries: total };
}

/**
 * Build synthesis prompt with sources and sub-query results
 *
 * @param originalQuestion - The user's original question
 * @param subQueryResults - Results from parallel sub-query execution
 * @param chunks - Aggregated and deduplicated chunks
 * @returns Formatted prompt for synthesis
 */
function buildSynthesisPromptWithCitations(
  originalQuestion: string,
  subQueryResults: SubQueryResult[],
  chunks: GroundingChunk[]
): string {
  const MAX_CHUNKS = 30;
  const MAX_CHUNK_LENGTH = 500;

  // Build source section with indexed chunks
  const sourceSection = chunks
    .slice(0, MAX_CHUNKS)
    .map((chunk, idx) => {
      const text = chunk.retrievedContext?.text || '';
      const preview =
        text.length > MAX_CHUNK_LENGTH
          ? text.slice(0, MAX_CHUNK_LENGTH) + '...'
          : text;
      return `[Source ${idx}]\n${preview}`;
    })
    .join('\n\n');

  // Build sub-query summary section
  const subQuerySection = subQueryResults
    .filter(r => r.success && r.answer.trim().length > 0)
    .map(
      (r, i) => `### Sub-Query ${i + 1}: ${r.subQuery}
${r.answer}`
    )
    .join('\n\n');

  return `## Original Question
"${originalQuestion}"

## Available Sources (Use [CITE:N] to reference, N is 0-based index)
${sourceSection}

## Preliminary Analysis (from sub-queries)
${subQuerySection}

## Your Task
Synthesize the above information into a coherent, well-structured answer.
- Use [CITE:N] for EVERY claim you make (where N is the source index)
- You may cite multiple sources: [CITE:0,3,5]
- Do not include any information not supported by the sources above`;
}

/**
 * Find the start of the sentence containing the given position
 *
 * Handles edge cases:
 * - Abbreviations (e.g., Dr., U.S., i.e.)
 * - Decimal numbers (e.g., 99.5%)
 *
 * @param text - The text to search
 * @param endPos - Position to search backwards from
 * @returns Start index of the sentence
 */
function findSentenceStart(text: string, endPos: number): number {
  for (let i = endPos - 1; i >= 0; i--) {
    const char = text[i];

    if (char === '.') {
      // Skip abbreviations (e.g., Dr., U.S.) - single capital letter before period
      if (
        i > 0 &&
        /[A-Z]/.test(text[i - 1]) &&
        (i < 2 || /\s/.test(text[i - 2]))
      ) {
        continue;
      }
      // Skip decimal numbers (e.g., 99.5%)
      if (
        i > 0 &&
        /\d/.test(text[i - 1]) &&
        i < text.length - 1 &&
        /\d/.test(text[i + 1])
      ) {
        continue;
      }
    }

    // Sentence boundaries: period, newline, colon, exclamation, question mark
    if (
      char === '.' ||
      char === '\n' ||
      char === ':' ||
      char === '!' ||
      char === '?'
    ) {
      let start = i + 1;
      // Skip leading whitespace
      while (start < endPos && /\s/.test(text[start])) {
        start++;
      }
      return start;
    }
  }

  // If no sentence boundary found, return start of text
  return 0;
}

/**
 * Parse citation markers from LLM response and extract citation positions
 *
 * @param responseText - Raw LLM response with [CITE:N] markers
 * @param maxChunkIndex - Maximum valid chunk index
 * @returns Cleaned text (without markers) and parsed citations
 */
function parseCitationMarkers(
  responseText: string,
  maxChunkIndex: number
): { cleanedText: string; citations: ParsedCitation[] } {
  const citations: ParsedCitation[] = [];
  const markerRegex = /\[CITE:(\d+(?:,\s*\d+)*)\]/g;

  let cleanedText = '';
  let lastIndex = 0;
  let match;

  while ((match = markerRegex.exec(responseText)) !== null) {
    // Add text before this marker
    cleanedText += responseText.slice(lastIndex, match.index);

    // Parse indices from the marker
    const indices = match[1]
      .split(',')
      .map(n => parseInt(n.trim(), 10))
      .filter(n => !isNaN(n) && n >= 0 && n < maxChunkIndex);

    if (indices.length > 0) {
      const citationEndPos = cleanedText.length;
      const sentenceStart = findSentenceStart(cleanedText, citationEndPos);

      citations.push({
        startIndex: sentenceStart,
        endIndex: citationEndPos,
        chunkIndices: indices,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last marker
  cleanedText += responseText.slice(lastIndex);

  return { cleanedText, citations };
}

/**
 * Merge overlapping or adjacent citations
 *
 * @param citations - Array of parsed citations
 * @returns Merged citations
 */
function mergeCitations(citations: ParsedCitation[]): ParsedCitation[] {
  if (citations.length === 0) return [];

  // Sort by start position
  const sorted = [...citations].sort((a, b) => a.startIndex - b.startIndex);
  const merged: ParsedCitation[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    // Merge if overlapping or adjacent
    if (current.startIndex <= last.endIndex + 1) {
      last.endIndex = Math.max(last.endIndex, current.endIndex);
      last.chunkIndices = Array.from(
        new Set([...last.chunkIndices, ...current.chunkIndices])
      );
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Convert parsed citations to GroundingSupport format
 *
 * @param cleanedText - Text with citation markers removed
 * @param citations - Parsed citations
 * @returns Array of GroundingSupport objects
 */
function citationsToGroundingSupports(
  cleanedText: string,
  citations: ParsedCitation[]
): GroundingSupport[] {
  const merged = mergeCitations(citations);

  return merged.map(c => ({
    segment: {
      startIndex: c.startIndex,
      endIndex: c.endIndex,
      text: cleanedText.slice(c.startIndex, c.endIndex),
    },
    groundingChunkIndices: c.chunkIndices,
  }));
}

/**
 * Synthesize multiple sub-query answers into a single coherent response
 *
 * Uses LLM Citation Markers for grounding:
 * 1. Aggregate chunks from all sub-queries
 * 2. Build prompt with indexed sources
 * 3. LLM generates response with [CITE:N] markers
 * 4. Parse markers to extract grounding metadata
 *
 * @param originalQuestion - The user's original question
 * @param subQueryResults - Results from parallel sub-query execution
 * @param fileSearchStoreId - The File Search Store ID (kept for interface compatibility, not used)
 * @returns ChatResponse with synthesized answer and grounding data
 */
export async function synthesizeResponses(
  originalQuestion: string,
  subQueryResults: SubQueryResult[],
  fileSearchStoreId: string // Interface compatibility, not used in LLM Citation Markers approach
): Promise<ChatResponse> {
  const startTime = Date.now();

  console.log('\n[Synthesis] ──────────────────────────────────────────');
  console.log('[Synthesis] Step 3: Response Synthesis (LLM Citation Markers)');
  console.log('[Synthesis] ──────────────────────────────────────────');

  // Suppress unused variable warning
  void fileSearchStoreId;

  // Filter to successful results only
  const successfulResults = subQueryResults.filter(r => r.success);

  if (successfulResults.length === 0) {
    console.error(
      '[Synthesis] ✗ No successful sub-query results to synthesize'
    );
    return getBestSubQueryAnswer(subQueryResults);
  }

  console.log(
    `[Synthesis] 📥 Input: ${successfulResults.length} successful sub-query answers`
  );

  // Step 1: Aggregate chunks from all sub-queries
  const { chunks, totalFromSubQueries } = aggregateChunks(successfulResults);

  console.log(
    `[Synthesis] 📊 Chunks: ${totalFromSubQueries} total → ${chunks.length} unique (after dedup)`
  );

  // Fallback if no chunks available
  if (chunks.length === 0) {
    console.log(
      '[Synthesis] ⚠️ No chunks available, using best sub-query answer'
    );
    return getBestSubQueryAnswer(subQueryResults);
  }

  // Log each successful result summary
  successfulResults.forEach((r, i) => {
    const answerPreview = r.answer.substring(0, 100).replace(/\n/g, ' ');
    console.log(
      `[Synthesis]   ├─ [${i + 1}] ${r.groundingChunks.length} chunks, ${r.answer.length} chars: "${answerPreview}..."`
    );
  });

  // Step 2: Build synthesis prompt with citations
  const prompt = buildSynthesisPromptWithCitations(
    originalQuestion,
    successfulResults,
    chunks
  );

  console.log(`[Synthesis] 📝 Synthesis prompt length: ${prompt.length} chars`);
  console.log(
    '[Synthesis] 🔄 Calling Gemini for synthesis (NO File Search)...'
  );

  // Step 3: Call Gemini WITHOUT File Search (sources already in prompt)
  const client = getGeminiClient();

  const rawAnswer = await withGeminiErrorHandling(async () => {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user' as const,
          parts: [{ text: prompt }],
        },
      ],
      config: {
        systemInstruction: SYNTHESIS_SYSTEM_PROMPT_WITH_CITATIONS,
        temperature: 0.3,
        // NO tools - we're using LLM Citation Markers instead
      },
    });

    return (
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Failed to generate synthesis'
    );
  });

  // Step 4: Parse citation markers
  const { cleanedText, citations } = parseCitationMarkers(
    rawAnswer,
    chunks.length
  );

  console.log(
    `[Synthesis] 🔍 Parsed ${citations.length} citation markers from response`
  );

  // Step 5: Convert to GroundingSupports
  const groundingSupports = citationsToGroundingSupports(
    cleanedText,
    citations
  );

  const elapsed = Date.now() - startTime;

  console.log('[Synthesis] ✓ Synthesis complete');
  console.log(`[Synthesis] 📊 Output: ${cleanedText.length} chars`);
  console.log(
    `[Synthesis] 🔗 Grounding: ${chunks.length} chunks, ${groundingSupports.length} supports`
  );
  console.log(`[Synthesis] ⏱️ Step 3 completed in ${elapsed}ms`);

  return {
    answer: cleanedText,
    groundingChunks: chunks,
    groundingSupports,
  };
}

/**
 * Get the best single sub-query answer as fallback
 *
 * Used when synthesis fails or no chunks available.
 * Returns the most complete answer based on grounding chunks and length.
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
