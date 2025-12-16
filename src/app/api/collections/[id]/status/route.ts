/**
 * Collection Job Status API
 * GET /api/collections/[id]/status
 *
 * Returns the processing status of papers in a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const collectionId = params.id;

    // Create Supabase client
    const supabase = await createServerSupabaseClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify collection exists and belongs to user
    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('id, user_id')
      .eq('id', collectionId)
      .single();

    if (collectionError || !collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    if (collection.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get paper processing status with text_vector_status and image_vector_status
    // Use FK hint to resolve ambiguity with source_paper_id relationship
    const { data: collectionPapers, error: papersError } = await supabase
      .from('collection_papers')
      .select(
        `
        paper:papers!collection_papers_paper_id_fkey(
          paper_id,
          text_vector_status,
          image_vector_status
        )
      `
      )
      .eq('collection_id', collectionId);

    if (papersError) {
      console.error('Error fetching collection papers:', papersError);
      return NextResponse.json(
        { error: 'Failed to fetch papers' },
        { status: 500 }
      );
    }

    // Calculate stats from text_vector_status (primary status for RAG readiness)
    const papers = collectionPapers || [];
    const totalPapers = papers.length;

    let indexedPapers = 0;
    let failedPapers = 0;
    let downloadingPapers = 0;
    let processingPapers = 0;

    // Type assertion needed until migration is applied and types are regenerated
    (
      papers as unknown as Array<{
        paper: {
          text_vector_status: string | null;
          image_vector_status: string | null;
        };
      }>
    ).forEach(item => {
      const textStatus = item.paper?.text_vector_status;
      // Note: imageStatus is available for future detailed status reporting
      // const imageStatus = item.paper?.image_vector_status;

      if (textStatus === 'completed') {
        indexedPapers++;
      } else if (textStatus === 'failed') {
        failedPapers++;
      } else if (textStatus === 'processing') {
        processingPapers++;
      } else if (textStatus === 'pending') {
        downloadingPapers++;
      }
    });

    const allProcessed = indexedPapers + failedPapers === totalPapers;

    return NextResponse.json({
      data: {
        totalPapers,
        indexedPapers,
        failedPapers,
        downloadingPapers,
        processingPapers,
        allProcessed,
      },
    });
  } catch (error) {
    console.error('Error fetching collection status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
