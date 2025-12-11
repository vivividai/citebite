/**
 * Collection Expand API
 * POST /api/collections/[id]/expand - Add papers from references/citations to collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { expandCollectionSchema } from '@/lib/validations/expand';
import {
  getCollectionWithOwnership,
  linkPapersToCollection,
} from '@/lib/db/collections';
import {
  semanticScholarPaperToDbPaper,
  upsertPapers,
  getOpenAccessPapers,
} from '@/lib/db/papers';
import { getSemanticScholarClient } from '@/lib/semantic-scholar/client';
import { queuePdfDownload } from '@/lib/jobs/queues';
import type { Paper } from '@/lib/semantic-scholar/types';

/**
 * POST /api/collections/[id]/expand
 * Add selected papers to collection
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const result = expandCollectionSchema.safeParse(body);

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

    const {
      selectedPaperIds,
      sourcePaperId,
      sourcePaperIds,
      sourceTypes,
      similarities,
      degrees,
    } = result.data;

    // 2. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Verify collection ownership
    await getCollectionWithOwnership(supabase, params.id, user.id);

    // 4. Get existing papers in collection to avoid duplicates
    const { data: existingPapers } = await supabase
      .from('collection_papers')
      .select('paper_id')
      .eq('collection_id', params.id);

    const existingPaperIds = new Set(
      existingPapers?.map(p => p.paper_id) || []
    );

    // Filter out already existing papers
    const newPaperIds = selectedPaperIds.filter(
      id => !existingPaperIds.has(id)
    );

    if (newPaperIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          addedCount: 0,
          openAccessCount: 0,
          message: 'All selected papers are already in the collection',
        },
      });
    }

    // 5. Fetch paper details from Semantic Scholar batch API
    console.log(
      `[ExpandCollection] Fetching ${newPaperIds.length} papers via batch API`
    );

    const client = getSemanticScholarClient();
    const batchResults = await client.getPapersBatchParallel(newPaperIds);

    // Filter out null results (papers that don't exist)
    const papers = batchResults.filter((p): p is Paper => p !== null);

    console.log(
      `[ExpandCollection] Retrieved ${papers.length}/${newPaperIds.length} papers from batch API`
    );

    if (papers.length === 0) {
      return NextResponse.json(
        {
          error: 'None of the selected papers could be found',
        },
        { status: 404 }
      );
    }

    // 6. Upsert papers to database
    const dbPapers = papers.map(semanticScholarPaperToDbPaper);
    const upsertedPaperIds = await upsertPapers(supabase, dbPapers);

    // 7. Link papers to collection with relationship data
    const paperLinkData = upsertedPaperIds.map(paperId => ({
      paperId,
      sourcePaperId: sourcePaperIds?.[paperId] ?? sourcePaperId ?? null, // Support both
      relationshipType: sourceTypes[paperId] ?? 'reference',
      similarityScore: similarities?.[paperId] ?? null,
      degree: degrees?.[paperId] ?? 1, // Default to 1 for expand
    }));
    await linkPapersToCollection(supabase, params.id, paperLinkData);

    // 8. Queue PDF download jobs for Open Access papers
    const openAccessPapers = getOpenAccessPapers(papers);
    const queuedJobs: (string | null)[] = [];

    for (const paper of openAccessPapers) {
      if (!paper.openAccessPdf?.url) continue;

      const jobId = await queuePdfDownload({
        collectionId: params.id,
        paperId: paper.paperId,
        pdfUrl: paper.openAccessPdf.url,
      });

      queuedJobs.push(jobId);
    }

    const successfulJobs = queuedJobs.filter(id => id !== null).length;

    console.log(
      `[ExpandCollection] Added ${upsertedPaperIds.length} papers to collection, queued ${successfulJobs} PDF downloads`
    );

    // 9. Return success response
    return NextResponse.json({
      success: true,
      data: {
        addedCount: upsertedPaperIds.length,
        openAccessCount: openAccessPapers.length,
        queuedDownloads: successfulJobs,
        message: `Successfully added ${upsertedPaperIds.length} papers to the collection`,
      },
    });
  } catch (error) {
    console.error('Error expanding collection:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('access denied')
    ) {
      return NextResponse.json(
        {
          error: 'Collection not found',
          message: errorMessage,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to expand collection',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
