import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createConversation } from '@/lib/db/conversations';
import { getCollectionWithOwnership } from '@/lib/db/collections';
import { createConversationSchema } from '@/lib/validations/conversations';

/**
 * POST /api/conversations
 * Create a new conversation within a collection
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const result = createConversationSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: result.error.issues.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const { collectionId, title } = result.data;

    // 3. Verify collection exists and user owns it
    try {
      await getCollectionWithOwnership(supabase, collectionId, user.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not found or access denied')) {
        return NextResponse.json(
          {
            error: 'Collection not found',
            message: errorMessage,
          },
          { status: 404 }
        );
      }

      throw error; // Re-throw for general error handler
    }

    // 4. Create conversation
    const conversation = await createConversation(
      supabase,
      collectionId,
      user.id,
      title
    );

    // 5. Return success response
    return NextResponse.json(
      {
        success: true,
        data: {
          conversation,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create conversation:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to create conversation',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
