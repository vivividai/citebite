/**
 * Single Paper Management API
 * DELETE /api/collections/[id]/papers/[paperId] - Remove a paper from collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCollectionWithOwnership } from '@/lib/db/collections';
import { deleteChunksForPaper } from '@/lib/db/chunks';
import { deletePdf, pdfExists } from '@/lib/storage/supabaseStorage';

interface RouteParams {
  params: Promise<{ id: string; paperId: string }>;
}

/**
 * DELETE /api/collections/[id]/papers/[paperId]
 * Remove a paper from a collection (including chunks and PDF)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: collectionId, paperId } = await params;

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

    // Verify paper exists in the collection
    const { data: link, error: linkError } = await supabase
      .from('collection_papers')
      .select('paper_id')
      .eq('collection_id', collectionId)
      .eq('paper_id', paperId)
      .single();

    if (linkError || !link) {
      return NextResponse.json(
        { error: 'Paper not found in collection' },
        { status: 404 }
      );
    }

    // 1. Delete vector chunks for this paper in this collection
    try {
      await deleteChunksForPaper(paperId, collectionId);
    } catch (chunkError) {
      console.warn(
        `[Paper Remove] Failed to delete chunks for paper ${paperId}:`,
        chunkError
      );
      // Continue - chunks may not exist if paper wasn't indexed
    }

    // 2. Delete PDF from storage (if exists)
    try {
      const hasPdf = await pdfExists(collectionId, paperId);
      if (hasPdf) {
        await deletePdf(collectionId, paperId);
      }
    } catch (pdfError) {
      console.warn(
        `[Paper Remove] Failed to delete PDF for paper ${paperId}:`,
        pdfError
      );
      // Continue - PDF may not exist
    }

    // 3. Remove link from collection_papers
    const { error: deleteError } = await supabase
      .from('collection_papers')
      .delete()
      .eq('collection_id', collectionId)
      .eq('paper_id', paperId);

    if (deleteError) {
      throw new Error(
        `Failed to remove paper from collection: ${deleteError.message}`
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Paper removed from collection',
      data: { paperId, collectionId },
    });
  } catch (error) {
    console.error('Error removing paper from collection:', error);
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
      { error: 'Failed to remove paper', message: errorMessage },
      { status: 500 }
    );
  }
}
