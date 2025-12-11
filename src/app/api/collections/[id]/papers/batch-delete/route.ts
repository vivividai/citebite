/**
 * Batch Paper Removal API
 * POST /api/collections/[id]/papers/batch-delete - Remove multiple papers from collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCollectionWithOwnership } from '@/lib/db/collections';
import { deleteChunksForPaper } from '@/lib/db/chunks';
import { deletePdf, pdfExists } from '@/lib/storage/supabaseStorage';

const batchDeleteSchema = z.object({
  paperIds: z
    .array(z.string().min(1))
    .min(1, 'At least one paper ID is required'),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface DeleteResult {
  paperId: string;
  success: boolean;
  error?: string;
}

/**
 * POST /api/collections/[id]/papers/batch-delete
 * Remove multiple papers from a collection
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: collectionId } = await params;

    // Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user owns the collection
    await getCollectionWithOwnership(supabase, collectionId, user.id);

    // Parse and validate request body
    const body = await request.json();
    const validation = batchDeleteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { paperIds } = validation.data;

    // Verify all papers exist in the collection
    const { data: existingLinks, error: linkError } = await supabase
      .from('collection_papers')
      .select('paper_id')
      .eq('collection_id', collectionId)
      .in('paper_id', paperIds);

    if (linkError) {
      throw new Error(`Failed to verify papers: ${linkError.message}`);
    }

    const existingPaperIds = new Set(
      (existingLinks || []).map(link => link.paper_id)
    );

    // Process each paper
    const results: DeleteResult[] = [];

    for (const paperId of paperIds) {
      // Skip papers not in collection
      if (!existingPaperIds.has(paperId)) {
        results.push({
          paperId,
          success: false,
          error: 'Paper not found in collection',
        });
        continue;
      }

      try {
        // 1. Delete vector chunks
        try {
          await deleteChunksForPaper(paperId, collectionId);
        } catch (chunkError) {
          console.warn(
            `[Batch Delete] Failed to delete chunks for paper ${paperId}:`,
            chunkError
          );
        }

        // 2. Delete PDF from storage
        try {
          const hasPdf = await pdfExists(collectionId, paperId);
          if (hasPdf) {
            await deletePdf(collectionId, paperId);
          }
        } catch (pdfError) {
          console.warn(
            `[Batch Delete] Failed to delete PDF for paper ${paperId}:`,
            pdfError
          );
        }

        // 3. Remove link from collection_papers
        const { error: deleteError } = await supabase
          .from('collection_papers')
          .delete()
          .eq('collection_id', collectionId)
          .eq('paper_id', paperId);

        if (deleteError) {
          throw new Error(deleteError.message);
        }

        results.push({ paperId, success: true });
      } catch (error) {
        results.push({
          paperId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    // Return appropriate status code
    const statusCode =
      failureCount === 0 ? 200 : successCount === 0 ? 500 : 207;

    return NextResponse.json(
      {
        success: failureCount === 0,
        message: `Removed ${successCount} of ${paperIds.length} papers`,
        data: {
          collectionId,
          results,
          summary: {
            total: paperIds.length,
            succeeded: successCount,
            failed: failureCount,
          },
        },
      },
      { status: statusCode }
    );
  } catch (error) {
    console.error('Error batch removing papers:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('access denied')
    ) {
      return NextResponse.json(
        { error: 'Collection not found', message: errorMessage },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to remove papers', message: errorMessage },
      { status: 500 }
    );
  }
}
