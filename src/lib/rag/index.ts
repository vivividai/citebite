/**
 * Custom RAG Query Orchestration
 *
 * Main entry point for RAG-based chat with papers.
 * Combines hybrid search with LLM generation and citation tracking.
 */

import { hybridSearch, SearchResult } from './search';
import { getGeminiClient, withGeminiErrorHandling } from '@/lib/gemini/client';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

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
}

/**
 * Custom RAG system prompt optimized for citation
 */
const CUSTOM_RAG_SYSTEM_PROMPT = `You are CiteBite, an AI research assistant specialized in analyzing academic papers.

## YOUR ROLE
You help researchers understand and synthesize findings from their paper collection. You will be provided with relevant excerpts from research papers as context.

## CITATION FORMAT (CRITICAL)
- Use [CITE:N] markers to cite sources (e.g., [CITE:1], [CITE:2])
- Each number corresponds to the source excerpt provided in the context
- You MUST cite sources for every factual claim you make
- If multiple sources support a claim, cite all of them (e.g., [CITE:1][CITE:3])

## RESPONSE STRUCTURE
1. Lead with the most relevant findings
2. Support each claim with [CITE:N] citations
3. When synthesizing across sources, cite all relevant ones
4. Be specific - include numbers, methods, or conclusions that can be traced to sources

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
  conversationHistory: ConversationMessage[] = []
): Promise<RAGResponse> {
  console.log(`[RAG] Starting query for collection ${collectionId}`);
  console.log(`[RAG] Query: "${query.substring(0, 100)}..."`);

  // 1. Hybrid search for relevant chunks
  const chunks = await hybridSearch(collectionId, query, { limit: 20 });

  if (chunks.length === 0) {
    console.log('[RAG] No relevant chunks found');
    return {
      answer:
        "I couldn't find relevant information in the papers for your question. This might mean the topic isn't covered in this collection, or try rephrasing your question.",
      groundingChunks: [],
      groundingSupports: [],
    };
  }

  console.log(`[RAG] Found ${chunks.length} relevant chunks`);

  // 2. Fetch paper metadata for context enrichment
  const paperIds = Array.from(new Set(chunks.map(c => c.paperId)));
  const paperMetadata = await fetchPaperMetadata(paperIds);

  // 3. Build context from chunks
  const context = buildContext(chunks, paperMetadata);

  // 4. Generate response with LLM
  const rawAnswer = await generateResponse(query, context, conversationHistory);

  // 5. Parse citations and map to chunks
  const { answer, citedIndices } = parseCitations(rawAnswer, chunks.length);

  // 6. Build grounding data for frontend
  const groundingChunks: GroundingChunk[] = citedIndices.map(idx => ({
    retrievedContext: {
      text: chunks[idx]?.content || '',
      // Store paper_id for frontend to lookup paper details
      paper_id: chunks[idx]?.paperId || '',
    },
  }));

  // Build grounding supports (map text segments to chunk indices)
  const groundingSupports = buildGroundingSupports(answer, citedIndices);

  console.log(`[RAG] Generated answer with ${citedIndices.length} citations`);

  return {
    answer,
    groundingChunks,
    groundingSupports,
  };
}

/**
 * Fetch paper metadata for context enrichment
 */
async function fetchPaperMetadata(
  paperIds: string[]
): Promise<
  Map<string, { title: string; year: number | null; authors: string }>
> {
  const supabase = createAdminSupabaseClient();
  const metadata = new Map<
    string,
    { title: string; year: number | null; authors: string }
  >();

  if (paperIds.length === 0) return metadata;

  const { data, error } = await supabase
    .from('papers')
    .select('paper_id, title, year, authors')
    .in('paper_id', paperIds);

  if (error) {
    console.error('[RAG] Failed to fetch paper metadata:', error);
    return metadata;
  }

  for (const paper of data || []) {
    const authorList = paper.authors as { name: string }[] | null;
    const authorsStr = authorList
      ? authorList
          .map(a => a.name)
          .slice(0, 3)
          .join(', ') + (authorList.length > 3 ? ' et al.' : '')
      : 'Unknown authors';

    metadata.set(paper.paper_id, {
      title: paper.title,
      year: paper.year,
      authors: authorsStr,
    });
  }

  return metadata;
}

/**
 * Build context string from search results
 */
function buildContext(
  chunks: SearchResult[],
  paperMetadata: Map<
    string,
    { title: string; year: number | null; authors: string }
  >
): string {
  return chunks
    .map((chunk, idx) => {
      const paper = paperMetadata.get(chunk.paperId);
      const paperInfo = paper
        ? `"${paper.title}" (${paper.authors}, ${paper.year || 'n.d.'})`
        : `Paper ID: ${chunk.paperId}`;

      return `[${idx + 1}] Source: ${paperInfo}
---
${chunk.content}
---`;
    })
    .join('\n\n');
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
  conversationHistory: ConversationMessage[]
): Promise<string> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

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
        parts: [{ text: buildPrompt(query, context) }],
      },
    ];

    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction: CUSTOM_RAG_SYSTEM_PROMPT,
        temperature: 0.2, // Low temperature for consistent, factual responses
        maxOutputTokens: 4096,
      },
    });

    return response.text || 'No response generated.';
  });
}

/**
 * Parse [CITE:N] citations from response text
 */
function parseCitations(
  text: string,
  maxChunks: number
): { answer: string; citedIndices: number[] } {
  const citedIndices: number[] = [];
  const citeRegex = /\[CITE:(\d+)\]/g;

  let match;
  while ((match = citeRegex.exec(text)) !== null) {
    const idx = parseInt(match[1], 10) - 1; // 1-indexed to 0-indexed
    if (idx >= 0 && idx < maxChunks && !citedIndices.includes(idx)) {
      citedIndices.push(idx);
    }
  }

  // Keep the [CITE:N] markers in the answer for frontend rendering
  // Frontend can convert these to interactive citations
  const answer = text;

  return { answer, citedIndices };
}

/**
 * Build grounding supports (text segment → chunk mapping)
 *
 * Creates a simplified mapping where each [CITE:N] marker
 * is linked to its corresponding chunk index.
 */
function buildGroundingSupports(
  answer: string,
  citedIndices: number[]
): GroundingSupport[] {
  const supports: GroundingSupport[] = [];
  const citeRegex = /\[CITE:(\d+)\]/g;

  let match;
  while ((match = citeRegex.exec(answer)) !== null) {
    const idx = parseInt(match[1], 10) - 1;
    if (idx >= 0 && citedIndices.includes(idx)) {
      supports.push({
        segment: {
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          text: match[0],
        },
        groundingChunkIndices: [citedIndices.indexOf(idx)],
      });
    }
  }

  return supports;
}

// Re-export search functions for convenience
export { hybridSearch, vectorSearch } from './search';
export type { SearchResult, SearchOptions } from './search';
