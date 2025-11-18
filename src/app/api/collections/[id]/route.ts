/**
 * Collection Detail API
 * GET /api/collections/[id] - Get a single collection with paper counts
 * DELETE /api/collections/[id] - Delete a collection
 *
 * Task 2.3: Collection Detail Page
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCollectionById, deleteCollection } from '@/lib/db/collections';

/**
 * GET /api/collections/[id]
 * Get a single collection with paper counts
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Get collection with ownership check and paper counts
    const collection = await getCollectionById(supabase, params.id, user.id);

    return NextResponse.json({
      success: true,
      data: {
        collection,
      },
    });
  } catch (error) {
    console.error('Error fetching collection:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a "not found" error
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
        error: 'Failed to fetch collection',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/collections/[id]
 * Delete a collection and all related data
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Delete collection (with ownership check)
    await deleteCollection(supabase, params.id, user.id);

    return NextResponse.json({
      success: true,
      message: 'Collection deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting collection:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a "not found" error
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
        error: 'Failed to delete collection',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
