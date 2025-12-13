/**
 * Paper Search API
 * GET /api/papers/search - Search for papers via Semantic Scholar
 *
 * Supports three search types:
 * - keywords: Full-text search across title and abstract
 * - title: Search by paper title (uses phrase matching)
 * - author: Search for papers by author name (uses /author/search endpoint)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSemanticScholarClient } from '@/lib/semantic-scholar/client';
import { z } from 'zod';

/**
 * Query parameter validation schema
 */
const searchParamsSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  searchType: z.enum(['title', 'author', 'keywords']).default('keywords'),
  yearFrom: z.coerce.number().int().min(1900).optional(),
  yearTo: z.coerce.number().int().max(new Date().getFullYear()).optional(),
  minCitations: z.coerce.number().int().min(0).optional(),
  openAccessOnly: z
    .string()
    .transform(v => v === 'true')
    .optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Paper search result type
 */
interface PaperSearchResult {
  paperId: string;
  title: string;
  authors: Array<{ name: string }>;
  year: number | null;
  abstract: string | null;
  citationCount: number | null;
  venue: string | null;
  isOpenAccess: boolean;
  openAccessPdfUrl: string | null;
}

/**
 * GET /api/papers/search
 * Search for papers via Semantic Scholar API
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const rawParams = {
      query: searchParams.get('query') || '',
      searchType: searchParams.get('searchType') || 'keywords',
      yearFrom: searchParams.get('yearFrom') || undefined,
      yearTo: searchParams.get('yearTo') || undefined,
      minCitations: searchParams.get('minCitations') || undefined,
      openAccessOnly: searchParams.get('openAccessOnly') || undefined,
      offset: searchParams.get('offset') || '0',
      limit: searchParams.get('limit') || '20',
    };

    const validation = searchParamsSchema.safeParse(rawParams);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid parameters',
          details: validation.error.issues.map(i => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    const params = validation.data;
    const client = getSemanticScholarClient();

    let papers: PaperSearchResult[] = [];
    let total = 0;

    // 3. Execute search based on search type
    if (params.searchType === 'author') {
      // Author search: Use the dedicated /author/search endpoint
      // This searches for authors by name and returns their papers
      const result = await client.searchPapersByAuthor(params.query, {
        limit: params.limit,
        offset: params.offset,
        yearFrom: params.yearFrom,
        yearTo: params.yearTo,
        minCitations: params.minCitations,
        openAccessOnly: params.openAccessOnly,
      });

      papers = result.papers.map(paper => ({
        paperId: paper.paperId,
        title: paper.title,
        authors: paper.authors || [],
        year: paper.year ?? null,
        abstract: paper.abstract ?? null,
        citationCount: paper.citationCount ?? null,
        venue: paper.venue ?? null,
        isOpenAccess: !!paper.openAccessPdf?.url,
        openAccessPdfUrl: paper.openAccessPdf?.url ?? null,
      }));
      total = result.total;
    } else {
      // Keywords or Title search: Use the bulk search endpoint
      // For title search, wrap in quotes for phrase matching
      let searchQuery = params.query;
      if (params.searchType === 'title') {
        // Wrap the query in quotes for phrase matching
        // This makes the search match the exact phrase in title or abstract
        // which is more appropriate for finding papers by title
        searchQuery = `"${params.query}"`;
      }

      const response = await client.searchPapers({
        keywords: searchQuery,
        yearFrom: params.yearFrom,
        yearTo: params.yearTo,
        minCitations: params.minCitations,
        openAccessOnly: params.openAccessOnly,
        limit: params.limit,
        offset: params.offset,
      });

      papers = (response.data || []).map(paper => ({
        paperId: paper.paperId,
        title: paper.title,
        authors: paper.authors || [],
        year: paper.year ?? null,
        abstract: paper.abstract ?? null,
        citationCount: paper.citationCount ?? null,
        venue: paper.venue ?? null,
        isOpenAccess: !!paper.openAccessPdf?.url,
        openAccessPdfUrl: paper.openAccessPdf?.url ?? null,
      }));
      total = response.total || 0;
    }

    // 4. Return response
    return NextResponse.json({
      success: true,
      data: {
        papers,
        total,
        offset: params.offset,
        hasMore: params.offset + papers.length < total,
      },
    });
  } catch (error) {
    console.error('[PaperSearch] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to search papers',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
