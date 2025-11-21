/**
 * API Route: POST /api/collections/ai/suggest-keywords
 *
 * Generate academic search keywords from natural language query using Gemini AI
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractKeywords } from '@/lib/gemini/keyword-extraction';

/**
 * Request validation schema
 */
const suggestKeywordsSchema = z.object({
  naturalLanguageQuery: z
    .string()
    .min(10, 'Query must be at least 10 characters')
    .max(1000, 'Query must be less than 1000 characters')
    .trim(),
});

/**
 * POST /api/collections/ai/suggest-keywords
 *
 * Request body:
 * {
 *   "naturalLanguageQuery": "I want to research about transformer architectures..."
 * }
 *
 * Response:
 * {
 *   "keywords": "transformer architecture AND attention mechanism",
 *   "reasoning": "Focused on core technical concepts...",
 *   "relatedTerms": ["self-attention", "encoder-decoder", ...]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const result = suggestKeywordsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { naturalLanguageQuery } = result.data;

    console.log('[API:SuggestKeywords] Received request');
    console.log(`[API:SuggestKeywords] Query length: ${naturalLanguageQuery.length} chars`);

    // Extract keywords using Gemini
    const suggestion = await extractKeywords(naturalLanguageQuery);

    console.log('[API:SuggestKeywords] Keywords generated successfully');

    return NextResponse.json(suggestion, { status: 200 });
  } catch (error) {
    console.error('[API:SuggestKeywords] Error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to generate keyword suggestions';

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
