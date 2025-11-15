/**
 * Collection Job Status API
 * GET /api/collections/[id]/status
 *
 * Returns the processing status of papers in a collection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const collectionId = params.id;

    // Create Supabase client
    const supabase = await createServerClient();

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

    // Get paper processing status
    // TODO: In Phase 1.2, we created the schema but vector_status field
    // will be added in Phase 2. For now, we'll use a placeholder structure.
    const { data: collectionPapers, error: papersError } = await supabase
      .from('collection_papers')
      .select(
        `
        paper:papers(
          paper_id,
          title
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

    const total = collectionPapers?.length || 0;

    // TODO: Once vector_status field is added in Phase 2, update this logic
    // For now, return basic stats
    const completed = 0; // Will be: papers with vector_status === 'completed'
    const failed = 0; // Will be: papers with vector_status === 'failed'
    const processing = 0; // Will be: papers with vector_status === 'processing'
    const pending = total; // Will be: papers with vector_status === 'pending'

    const progress = total > 0 ? (completed / total) * 100 : 0;

    return NextResponse.json({
      total,
      completed,
      failed,
      processing,
      pending,
      progress: Math.round(progress * 100) / 100, // Round to 2 decimal places
      status:
        completed === total
          ? 'completed'
          : failed > 0
            ? 'partial'
            : processing > 0
              ? 'processing'
              : 'pending',
    });
  } catch (error) {
    console.error('Error fetching collection status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
