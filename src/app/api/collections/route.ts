/**
 * Collections API
 * GET /api/collections - Get user's collections
 * POST /api/collections - Create a new collection with seed papers
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { seedPaperCollectionSchema } from '@/lib/validations/collections';
import { queuePdfDownload } from '@/lib/jobs/queues';
import {
  createCollection,
  linkPapersToCollection,
  getUserCollections,
} from '@/lib/db/collections';
import {
  semanticScholarPaperToDbPaper,
  upsertPapers,
  getDownloadablePapers,
} from '@/lib/db/papers';
import { getSemanticScholarClient } from '@/lib/semantic-scholar/client';
import type { Paper } from '@/lib/semantic-scholar/types';

/**
 * GET /api/collections
 * Get user's collections with paper counts
 */
export async function GET() {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's collections
    const collections = await getUserCollections(supabase, user.id);

    return NextResponse.json({
      success: true,
      data: {
        collections,
      },
    });
  } catch (error) {
    console.error('Error fetching collections:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to fetch collections',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/collections
 * Create a new collection with seed papers
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const result = seedPaperCollectionSchema.safeParse(body);

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

    // 3. Fetch papers from Semantic Scholar using batch API
    console.log(
      `[CollectionAPI] Fetching ${validatedData.seedPaperIds.length} seed papers via batch API`
    );

    const client = getSemanticScholarClient();
    const batchResults = await client.getPapersBatchParallel(
      validatedData.seedPaperIds
    );

    // Filter out null results (papers that don't exist)
    const papers = batchResults.filter((p): p is Paper => p !== null);

    console.log(
      `[CollectionAPI] Retrieved ${papers.length}/${validatedData.seedPaperIds.length} papers from batch API`
    );

    // 4. Handle empty results
    if (papers.length === 0) {
      return NextResponse.json(
        {
          error:
            'No valid papers found. Some papers may have been removed from Semantic Scholar.',
        },
        { status: 404 }
      );
    }

    // 5. Create collection in database
    const collection = await createCollection(supabase, {
      name: validatedData.name,
      search_query: '', // Empty for seed paper collections
      filters: null,
      user_id: user.id,
      use_ai_assistant: false,
      natural_language_query: validatedData.researchQuestion, // Store research question for auto-expand similarity
    });

    // 6. Upsert papers to database
    const dbPapers = papers.map(semanticScholarPaperToDbPaper);
    const upsertedPaperIds = await upsertPapers(supabase, dbPapers);

    // 7. Link papers to collection via collection_papers
    await linkPapersToCollection(supabase, collection.id, upsertedPaperIds);

    // 8. Queue PDF download jobs for downloadable papers (OA, ArXiv, or DOI)
    const downloadablePapers = getDownloadablePapers(papers);
    const queuedJobs: (string | null)[] = [];

    for (const paper of downloadablePapers) {
      const jobId = await queuePdfDownload({
        paperId: paper.paperId,
        pdfUrl: paper.openAccessPdf?.url,
        arxivId: paper.externalIds?.ArXiv,
        doi: paper.externalIds?.DOI,
      });

      queuedJobs.push(jobId);
    }

    const successfulJobs = queuedJobs.filter(id => id !== null).length;

    // 9. Return success response
    return NextResponse.json(
      {
        success: true,
        data: {
          collection: {
            id: collection.id,
            name: collection.name,
            naturalLanguageQuery: collection.natural_language_query,
            createdAt: collection.created_at,
          },
          stats: {
            totalPapers: papers.length,
            downloadablePapers: downloadablePapers.length,
            queuedDownloads: successfulJobs,
            failedToQueue: queuedJobs.length - successfulJobs,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    // Handle errors
    console.error('Error creating collection:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to create collection',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
