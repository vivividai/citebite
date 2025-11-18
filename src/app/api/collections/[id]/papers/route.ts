/**
 * Collection Papers API
 * GET /api/collections/[id]/papers - Get all papers for a collection
 *
 * Task 2.3: Collection Detail Page
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCollectionWithOwnership } from '@/lib/db/collections';
import { getCollectionPapers } from '@/lib/db/papers';

/**
 * GET /api/collections/[id]/papers
 * Get all papers for a collection
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

    // Verify user owns the collection
    await getCollectionWithOwnership(supabase, params.id, user.id);

    // Get papers for the collection
    const papers = await getCollectionPapers(supabase, params.id);

    return NextResponse.json({
      success: true,
      data: {
        papers,
      },
    });
  } catch (error) {
    console.error('Error fetching collection papers:', error);
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
        error: 'Failed to fetch papers',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
