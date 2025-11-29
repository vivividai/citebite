/**
 * Collections Preview API
 * POST /api/collections/preview - Preview papers count before creating collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCollectionSchema } from '@/lib/validations/collections';
import { searchWithReranking } from '@/lib/search';
import { expandQueryForReranking } from '@/lib/gemini/query-expand';
import type { PaperPreview } from '@/lib/search/types';

/**
 * POST /api/collections/preview
 * Preview how many papers match the search criteria without creating collection
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const result = createCollectionSchema.safeParse(body);

    if (!result.success) {
      console.error('Validation failed:', result.error);
      const errors = result.error.issues || [];

      return NextResponse.json(
        {
          error: 'Invalid input',
          details: errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const validatedData = result.data;

    // 2. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Search papers with semantic re-ranking
    // Use TEST_PAPER_LIMIT in test environment to reduce paper count for faster tests
    const paperLimit = process.env.TEST_PAPER_LIMIT
      ? parseInt(process.env.TEST_PAPER_LIMIT, 10)
      : 100; // Default limit for final papers to return

    // Use naturalLanguageQuery for embedding, fallback to keywords
    // Schema refine() guarantees at least one is present
    const originalQuery =
      validatedData.naturalLanguageQuery || validatedData.keywords || '';

    // Expand query for better SPECTER embedding similarity
    const { expandedQuery } = await expandQueryForReranking(originalQuery);

    // Fetch ALL matching papers (up to 10,000) for comprehensive re-ranking
    // This ensures we find the most semantically relevant papers, not just the first batch
    const searchResult = await searchWithReranking({
      userQuery: expandedQuery,
      searchKeywords: validatedData.keywords || '',
      // initialLimit now defaults to 10,000 - fetch all papers for re-ranking
      finalLimit: paperLimit,
      yearFrom: validatedData.filters?.yearFrom,
      yearTo: validatedData.filters?.yearTo,
      minCitations: validatedData.filters?.minCitations,
      openAccessOnly: validatedData.filters?.openAccessOnly,
    });

    // 4. Handle empty search results
    if (searchResult.papers.length === 0) {
      return NextResponse.json(
        {
          error:
            'No papers found matching your criteria. Try different keywords or adjust your filters.',
        },
        { status: 404 }
      );
    }

    const papers = searchResult.papers;

    // 5. Transform papers to preview format
    // Sort: papers with embeddings (by similarity desc) first, then papers without embeddings
    const papersWithEmbedding = papers.filter(p => p.similarity !== undefined);
    const papersWithoutEmbedding = papers.filter(
      p => p.similarity === undefined
    );

    const sortedPapers = [
      ...papersWithEmbedding.sort(
        (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)
      ),
      ...papersWithoutEmbedding,
    ];

    const previewPapers: PaperPreview[] = sortedPapers.map(paper => ({
      paperId: paper.paperId,
      title: paper.title,
      authors: paper.authors?.map(a => ({ name: a.name })) || [],
      year: paper.year ?? null,
      abstract: paper.abstract ?? null,
      citationCount: paper.citationCount ?? null,
      venue: paper.venue ?? null,
      similarity: paper.similarity ?? null,
      hasEmbedding: paper.similarity !== undefined,
      isOpenAccess: !!paper.openAccessPdf?.url,
    }));

    // 6. Count Open Access papers
    const openAccessCount = papers.filter(
      paper => paper.openAccessPdf?.url != null
    ).length;

    // 7. Return preview with full paper list
    return NextResponse.json({
      success: true,
      data: {
        papers: previewPapers,
        stats: {
          totalPapers: papers.length,
          openAccessPapers: openAccessCount,
          paywalledPapers: papers.length - openAccessCount,
          papersWithEmbeddings: searchResult.stats.papersWithEmbeddings,
          rerankingApplied: searchResult.stats.rerankingApplied,
        },
        searchQuery: validatedData.keywords,
        filters: validatedData.filters || null,
      },
    });
  } catch (error) {
    // Handle errors
    console.error('Error previewing collection:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to preview collection',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
