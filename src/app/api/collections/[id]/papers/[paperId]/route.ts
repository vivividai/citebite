/**
 * Single Paper Management API
 * DELETE /api/collections/[id]/papers/[paperId] - Remove a paper from collection
 *
 * Note: This only removes the collection_papers link.
 * Chunks and PDFs are NOT deleted (they may be used by other collections).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCollectionWithOwnership } from '@/lib/db/collections';

interface RouteParams {
  params: Promise<{ id: string; paperId: string }>;
}

/**
 * DELETE /api/collections/[id]/papers/[paperId]
 * Remove a paper from a collection (only removes the link, keeps chunks and PDF)
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

    // Remove link from collection_papers
    // Note: Chunks and PDF are NOT deleted - they may be used by other collections
    // and can be reused if the paper is added back to this collection
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
