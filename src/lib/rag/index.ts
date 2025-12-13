/**
 * Custom RAG Query Orchestration
 *
 * Main entry point for RAG-based chat with papers.
 * Combines hybrid search with LLM generation and citation tracking.
 */

import { hybridSearch, SearchResult } from './search';
import { enrichSearchResultsWithFigures } from './search-postprocessor';
import { getGeminiClient, withGeminiErrorHandling } from '@/lib/gemini/client';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GeminiModel } from '@/lib/validations/conversations';

// API Trace logging for debugging
const TRACE_DIR = join(process.cwd(), 'docs', 'info');
const TRACE_FILE = join(TRACE_DIR, 'rag-api-trace.md');
let traceEnabled = false;
let traceContent = '';

export function startAPITrace() {
  traceEnabled = true;
  traceContent = '';
  if (!existsSync(TRACE_DIR)) {
    mkdirSync(TRACE_DIR, { recursive: true });
  }
  const header = `# RAG API Trace Log
Generated: ${new Date().toISOString()}

---

`;
  traceContent = header;
  writeFileSync(TRACE_FILE, traceContent);
  console.log('[TRACE] API trace started');
}

export function appendTrace(section: string, content: unknown) {
  if (!traceEnabled) return;
  const text =
    typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const entry = `\n## ${section}\n\`\`\`json\n${text}\n\`\`\`\n`;
  traceContent += entry;
  appendFileSync(TRACE_FILE, entry);
}

export function endAPITrace() {
  if (!traceEnabled) return;
  const footer = `\n---\n\n# End of Trace\n`;
  appendFileSync(TRACE_FILE, footer);
  traceEnabled = false;
  console.log(`[TRACE] API trace saved to ${TRACE_FILE}`);
}

/**
 * Conversation message format
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * RAG response with answer and citation metadata
 */
export interface RAGResponse {
  answer: string;
  groundingChunks: GroundingChunk[];
  groundingSupports: GroundingSupport[];
  /** Figures referenced in text chunks but not directly in results */
  relatedFigures?: GroundingChunk[];
}

/**
 * Custom RAG system prompt optimized for citation (supports multimodal)
 */
const CUSTOM_RAG_SYSTEM_PROMPT = `You are CiteBite, an AI research assistant specialized in analyzing academic papers.

## YOUR ROLE
You help researchers understand and synthesize findings from their paper collection. You will be provided with relevant excerpts from research papers as context, including both text and figure descriptions.

## CITATION FORMAT (CRITICAL)
- Use [CITE:N] markers to cite text sources (e.g., [CITE:1], [CITE:2])
- Use [FIGURE:Figure X] markers to reference figures (e.g., [FIGURE:Figure 1], [FIGURE:Table 2])
- Each number corresponds to the source excerpt provided in the context
- You MUST cite sources for every factual claim you make
- If multiple sources support a claim, cite all of them (e.g., [CITE:1][CITE:3])

## FIGURE REFERENCES
- When a text excerpt mentions a figure (indicated by [References: Figure X]), you should reference that figure in your response
- Use the exact format: [FIGURE:Figure 1], [FIGURE:Table 2], etc.
- Describe what the figure shows based on the provided description
- Related figures at the end of context should be used when relevant

## RESPONSE STRUCTURE
1. Lead with the most relevant findings
2. Support each claim with [CITE:N] citations
3. Reference relevant figures using [FIGURE:Figure X] format
4. When synthesizing across sources, cite all relevant ones
5. Be specific - include numbers, methods, or conclusions that can be traced to sources

## HANDLING LIMITATIONS
- If context doesn't contain relevant information: "Based on the available excerpts, I couldn't find specific information about [topic]."
- If only one source is relevant: Acknowledge this and provide what you can
- If information conflicts: Present both perspectives with their citations

Remember: Every statement must be supported by the provided context using [CITE:N] format.`;

/**
 * Query the RAG system with a user question
 *
 * Process:
 * 1. Perform hybrid search to find relevant chunks
 * 2. Build context from search results with [N] markers
 * 3. Generate response using Gemini with context
 * 4. Parse [CITE:N] citations and map to chunks
 * 5. Return answer with grounding metadata
 *
 * @param collectionId - Collection to search within
 * @param query - User's question
 * @param conversationHistory - Previous messages for context
 * @returns RAG response with answer and citations
 *
 * @example
 * ```typescript
 * const response = await queryRAG(
 *   'collection-uuid',
 *   'What are the main findings about attention mechanisms?',
 *   previousMessages
 * );
 * console.log(response.answer);
 * console.log(response.groundingChunks.length, 'sources cited');
 * ```
 */
export async function queryRAG(
  collectionId: string,
  query: string,
  conversationHistory: ConversationMessage[] = [],
  enableTrace: boolean = false,
  model: GeminiModel = 'gemini-2.5-flash'
): Promise<RAGResponse> {
  // Start API trace if enabled
  if (enableTrace) {
    startAPITrace();
    appendTrace('1. RAG Query Input', {
      collectionId,
      query,
      conversationHistoryLength: conversationHistory.length,
      conversationHistory: conversationHistory.map(m => ({
        role: m.role,
        contentPreview: m.content.substring(0, 200) + '...',
      })),
      timestamp: new Date().toISOString(),
    });
  }

  console.log(`[RAG] Starting query for collection ${collectionId}`);
  console.log(`[RAG] Query: "${query.substring(0, 100)}..."`);

  // 1. Hybrid search for relevant chunks
  const chunks = await hybridSearch(collectionId, query, { limit: 20 });

  if (enableTrace) {
    appendTrace('2. Hybrid Search Results', {
      totalChunks: chunks.length,
      chunks: chunks.map((c, i) => ({
        index: i,
        paperId: c.paperId,
        chunkId: c.chunkId,
        chunkIndex: c.chunkIndex,
        semanticScore: c.semanticScore,
        keywordScore: c.keywordScore,
        combinedScore: c.combinedScore,
        contentPreview: c.content.substring(0, 300) + '...',
        contentLength: c.content.length,
      })),
    });
  }

  if (chunks.length === 0) {
    console.log('[RAG] No relevant chunks found');
    if (enableTrace) {
      appendTrace('ERROR', { message: 'No relevant chunks found' });
      endAPITrace();
    }
    return {
      answer:
        "I couldn't find relevant information in the papers for your question. This might mean the topic isn't covered in this collection, or try rephrasing your question.",
      groundingChunks: [],
      groundingSupports: [],
    };
  }

  console.log(`[RAG] Found ${chunks.length} relevant chunks`);

  // 2. Enrich results with figure URLs and related figures
  const enrichedResults = await enrichSearchResultsWithFigures(
    chunks,
    collectionId
  );
  const { chunks: enrichedChunks, relatedFigures } = enrichedResults;

  console.log(
    `[RAG] Found ${relatedFigures.length} related figures from text references`
  );

  // 3. Build context from chunks (paper metadata not included, frontend looks it up via paper_id)
  const context = buildContext(enrichedChunks, relatedFigures);

  if (enableTrace) {
    appendTrace('4. Built Context for LLM', {
      contextLength: context.length,
      fullContext: context,
    });
  }

  // 4. Generate response with LLM
  const rawAnswer = await generateResponse(
    query,
    context,
    conversationHistory,
    enableTrace,
    model
  );

  if (enableTrace) {
    appendTrace('6. Raw LLM Response', {
      rawAnswerLength: rawAnswer.length,
      rawAnswer,
    });
  }

  // 5. Parse citations and map to chunks
  const { answer: parsedAnswer, citedIndices } = parseCitations(
    rawAnswer,
    enrichedChunks.length
  );

  if (enableTrace) {
    appendTrace('7. Parsed Citations', {
      citedIndices,
      citedChunks: citedIndices.map(idx => ({
        index: idx,
        paperId: enrichedChunks[idx]?.paperId,
        contentPreview: enrichedChunks[idx]?.content?.substring(0, 200) + '...',
      })),
    });
  }

  // 6. Build grounding data for frontend
  // Create a map from original chunk index (0-based) to groundingChunks array index
  const indexMap = new Map<number, number>();
  citedIndices.forEach((originalIdx, groundingIdx) => {
    indexMap.set(originalIdx, groundingIdx);
  });

  // 7. Renumber citations in the answer to match groundingChunks indices
  // [CITE:6] → [CITE:1] if original index 5 maps to groundingChunks[0]
  const answer = renumberCitations(parsedAnswer, indexMap);

  const groundingChunks: GroundingChunk[] = citedIndices.map(idx => {
    const chunk = enrichedChunks[idx];
    return {
      retrievedContext: {
        text: chunk?.content || '',
        paper_id: chunk?.paperId || '',
        // Multimodal RAG fields
        chunk_type: chunk?.chunkType,
        figure_number: chunk?.figureNumber,
        figure_caption: chunk?.figureCaption,
        image_url: chunk?.imageUrl,
        page_number: chunk?.pageNumber,
      },
    };
  });

  // 8. Build related figures for frontend (figures referenced in text but not cited)
  const relatedFigureChunks: GroundingChunk[] = relatedFigures.map(fig => ({
    retrievedContext: {
      text: fig.content || '',
      paper_id: fig.paperId || '',
      chunk_type: 'figure',
      figure_number: fig.figureNumber,
      figure_caption: fig.figureCaption,
      image_url: fig.imageUrl,
      page_number: fig.pageNumber,
      is_related: true,
    },
  }));

  // Build grounding supports (map text segments to NEW chunk indices)
  const groundingSupports = buildGroundingSupports(answer);

  console.log(`[RAG] Generated answer with ${citedIndices.length} citations`);

  if (enableTrace) {
    appendTrace('8. Final Response', {
      answerLength: answer.length,
      answer,
      groundingChunksCount: groundingChunks.length,
      groundingChunks: groundingChunks.map((c, i) => ({
        index: i,
        paper_id: c.retrievedContext?.paper_id,
        textPreview: c.retrievedContext?.text?.substring(0, 200) + '...',
      })),
      groundingSupportsCount: groundingSupports.length,
      groundingSupports,
    });
    endAPITrace();
  }

  return {
    answer,
    groundingChunks,
    groundingSupports,
    relatedFigures:
      relatedFigureChunks.length > 0 ? relatedFigureChunks : undefined,
  };
}

/**
 * Remove paper reference markers from chunk content
 *
 * Academic papers contain inline references like [12], [1,2,3], [1-5], etc.
 * These cause noise when LLM parses citations since our system uses [CITE:N].
 *
 * Patterns removed:
 * - [12] - single reference
 * - [1,2,3] or [1, 2, 3] - comma-separated references
 * - [1-5] - range references
 * - [12][13][14] - consecutive references
 * - [1,2-5,7] - mixed references
 *
 * NOT removed (to preserve readability):
 * - [Figure 1], [Table 2] - figure/table references
 * - [a], [b], [c] - alphabetic references
 * - [2024] - years (4 digits)
 */
function removeReferences(content: string): string {
  // Match patterns like [12], [1,2,3], [1-5], [1,2-5,7]
  // Uses negative lookahead/lookbehind to avoid matching years like [2024]
  // Pattern breakdown:
  // - \[ : opening bracket
  // - \d{1,3} : 1-3 digit number (not 4 to avoid years)
  // - (?:[,\s-]+\d{1,3})* : optionally followed by comma/dash/space and more numbers
  // - \] : closing bracket
  const referencePattern = /\[\d{1,3}(?:[,\s-]+\d{1,3})*\]/g;

  return content.replace(referencePattern, '');
}

/**
 * Build context string from search results (supports multimodal)
 *
 * Note: Paper metadata (title, authors, year) is NOT included in context.
 * Frontend can look up paper details via paper_id in groundingChunks.
 * This reduces token usage significantly.
 */
function buildContext(
  chunks: SearchResult[],
  relatedFigures: SearchResult[] = []
): string {
  const parts: string[] = [];

  // Main search results
  chunks.forEach((chunk, idx) => {
    if (chunk.chunkType === 'figure') {
      // Figure chunk format
      parts.push(`[${idx + 1}] [FIGURE: ${chunk.figureNumber}] (Paper ID: ${chunk.paperId}, Page ${chunk.pageNumber || '?'})
Caption: ${chunk.figureCaption || 'No caption'}

${chunk.figureDescription || chunk.content}`);
    } else {
      // Text chunk format
      const cleanedContent = removeReferences(chunk.content);

      let text = `[${idx + 1}] (Paper ID: ${chunk.paperId})
${cleanedContent}`;

      // Add figure reference hint if this chunk references figures
      if (chunk.referencedFigures && chunk.referencedFigures.length > 0) {
        text += `\n[References: ${chunk.referencedFigures.join(', ')}]`;
      }

      parts.push(text);
    }
  });

  // Related figures (referenced in text but not in main results)
  if (relatedFigures.length > 0) {
    parts.push('\n--- Related Figures (referenced in text above) ---\n');

    relatedFigures.forEach((fig, i) => {
      parts.push(`[RELATED-${i + 1}] [FIGURE: ${fig.figureNumber}] (Paper ID: ${fig.paperId}, Page ${fig.pageNumber || '?'})
Caption: ${fig.figureCaption || 'No caption'}

${fig.figureDescription || fig.content}`);
    });
  }

  return parts.join('\n\n');
}

/**
 * Build prompt for LLM
 */
function buildPrompt(query: string, context: string): string {
  return `Based on the following research paper excerpts, answer the question.
Use [CITE:N] markers to cite specific sources (e.g., [CITE:1], [CITE:2]).

## Context from Papers:

${context}

## Question: ${query}

## Instructions:
- Answer based ONLY on the provided context
- Use [CITE:N] format to cite sources (N is the source number)
- If information isn't in the context, say so
- Be specific and cite multiple sources when applicable`;
}

/**
 * Generate response using Gemini
 */
async function generateResponse(
  query: string,
  context: string,
  conversationHistory: ConversationMessage[],
  enableTrace: boolean = false,
  model: GeminiModel = 'gemini-2.5-flash'
): Promise<string> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    const prompt = buildPrompt(query, context);

    // Build conversation contents
    const contents = [
      // Previous conversation (last 10 messages for context)
      ...conversationHistory.slice(-10).map(msg => ({
        role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: msg.content }],
      })),
      // Current query with context
      {
        role: 'user' as const,
        parts: [{ text: prompt }],
      },
    ];

    const requestConfig = {
      model,
      contents,
      config: {
        systemInstruction: CUSTOM_RAG_SYSTEM_PROMPT,
        temperature: 0.2, // Low temperature for consistent, factual responses
        maxOutputTokens: 16384,
      },
    };

    if (enableTrace) {
      appendTrace('5. Gemini API Request', {
        model: requestConfig.model,
        systemInstruction: CUSTOM_RAG_SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 4096,
        contentsCount: contents.length,
        userPrompt: prompt,
        conversationHistoryInRequest: conversationHistory.slice(-10).map(m => ({
          role: m.role,
          contentLength: m.content.length,
        })),
      });
    }

    const response = await client.models.generateContent(requestConfig);

    return response.text || 'No response generated.';
  });
}

/**
 * Parse citations from response text
 * Supports both [CITE:N] and [N] formats (Gemini 3 Pro Preview uses [N])
 *
 * Also normalizes the response to use [CITE:N] format for consistent frontend rendering
 */
function parseCitations(
  text: string,
  maxChunks: number
): { answer: string; citedIndices: number[] } {
  const citedIndices: number[] = [];

  // Match both [CITE:N] and [N] formats (but not [N] when N is very large, likely not a citation)
  // [CITE:N] - explicit citation format
  // [N] - simple format (common from Gemini models), but avoid matching things like [100+] or [2024]
  const citeRegex = /\[CITE:(\d+)\]|\[(\d{1,2})\](?!\d)/g;

  let match;
  while ((match = citeRegex.exec(text)) !== null) {
    // match[1] is for [CITE:N], match[2] is for [N]
    const numStr = match[1] || match[2];
    const idx = parseInt(numStr, 10) - 1; // 1-indexed to 0-indexed
    if (idx >= 0 && idx < maxChunks && !citedIndices.includes(idx)) {
      citedIndices.push(idx);
    }
  }

  // Normalize [N] format to [CITE:N] for consistent frontend rendering
  // This ensures the frontend only needs to handle one format
  const answer = text.replace(/\[(\d{1,2})\](?!\d)/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (idx >= 0 && idx < maxChunks) {
      return `[CITE:${num}]`;
    }
    return match; // Keep original if out of range
  });

  return { answer, citedIndices };
}

/**
 * Renumber citations in the answer to match groundingChunks indices
 *
 * After filtering to only cited chunks, we need to renumber the citations
 * in the answer so that [CITE:N] correctly refers to groundingChunks[N-1].
 *
 * Example:
 * - Original answer has [CITE:6], [CITE:15], [CITE:18]
 * - citedIndices = [5, 14, 17] (0-based original indices)
 * - groundingChunks[0] = chunk 5, groundingChunks[1] = chunk 14, etc.
 * - indexMap: 5→0, 14→1, 17→2
 * - Renumbered answer: [CITE:1], [CITE:2], [CITE:3]
 *
 * @param answer - The answer text with original [CITE:N] markers
 * @param indexMap - Map from original chunk index (0-based) to groundingChunks index
 * @returns Answer with renumbered citations
 */
function renumberCitations(
  answer: string,
  indexMap: Map<number, number>
): string {
  return answer.replace(/\[CITE:(\d+)\]/g, (match, num) => {
    const originalIdx = parseInt(num, 10) - 1; // 1-indexed to 0-indexed
    const newIdx = indexMap.get(originalIdx);

    if (newIdx !== undefined) {
      // Convert back to 1-indexed for display
      return `[CITE:${newIdx + 1}]`;
    }

    // Keep original if not found (shouldn't happen with valid data)
    return match;
  });
}

/**
 * Build grounding supports (text segment → chunk mapping)
 *
 * Creates a simplified mapping where each [CITE:N] marker
 * is linked to its corresponding chunk index in the groundingChunks array.
 *
 * NOTE: This function expects the answer to have ALREADY been renumbered
 * by renumberCitations(), so [CITE:N] directly maps to groundingChunks[N-1].
 *
 * @param answer - The generated answer text with RENUMBERED [CITE:N] markers
 */
function buildGroundingSupports(answer: string): GroundingSupport[] {
  const supports: GroundingSupport[] = [];
  const citeRegex = /\[CITE:(\d+)\]/g;

  let match;
  while ((match = citeRegex.exec(answer)) !== null) {
    // After renumbering, [CITE:N] directly refers to groundingChunks[N-1]
    const groundingIdx = parseInt(match[1], 10) - 1; // 1-indexed to 0-indexed

    supports.push({
      segment: {
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        text: match[0],
      },
      groundingChunkIndices: [groundingIdx],
    });
  }

  return supports;
}

// Re-export search functions for convenience
export { hybridSearch, vectorSearch } from './search';
export type { SearchResult, SearchOptions } from './search';
