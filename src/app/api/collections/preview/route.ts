/**
 * Collections Preview API
 * POST /api/collections/preview - Preview papers count before creating collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCollectionSchema } from '@/lib/validations/collections';
import { getSemanticScholarClient } from '@/lib/semantic-scholar/client';

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

    // 3. Search papers via Semantic Scholar
    const semanticScholarClient = getSemanticScholarClient();

    // Use TEST_PAPER_LIMIT in test environment to reduce paper count for faster tests
    const paperLimit = process.env.TEST_PAPER_LIMIT
      ? parseInt(process.env.TEST_PAPER_LIMIT, 10)
      : 100; // Default limit for initial collection

    const searchResponse = await semanticScholarClient.searchPapers({
      keywords: validatedData.keywords,
      yearFrom: validatedData.filters?.yearFrom,
      yearTo: validatedData.filters?.yearTo,
      minCitations: validatedData.filters?.minCitations,
      openAccessOnly: validatedData.filters?.openAccessOnly,
      limit: paperLimit,
    });

    // 4. Handle empty search results
    if (searchResponse.total === 0 || searchResponse.data.length === 0) {
      return NextResponse.json(
        {
          error:
            'No papers found matching your criteria. Try different keywords or adjust your filters.',
        },
        { status: 404 }
      );
    }

    const papers = searchResponse.data;

    // 5. Count Open Access papers
    const openAccessPapers = papers.filter(
      paper => paper.openAccessPdf?.url != null
    );

    // 6. Return preview statistics
    return NextResponse.json({
      success: true,
      data: {
        totalPapers: papers.length,
        openAccessPapers: openAccessPapers.length,
        paywalledPapers: papers.length - openAccessPapers.length,
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
