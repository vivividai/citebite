import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  updateConversationTitle,
  deleteConversation,
  getConversationWithOwnership,
} from '@/lib/db/conversations';
import { z } from 'zod';

const updateConversationSchema = z.object({
  title: z.string().min(1).max(200),
});

/**
 * PATCH /api/conversations/[id]
 * Update conversation title (rename)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const conversationId = params.id;

    // 2. Parse and validate request body
    const body = await request.json();
    const result = updateConversationSchema.safeParse(body);

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

    const { title } = result.data;

    // 3. Update conversation title (includes ownership check)
    await updateConversationTitle(supabase, conversationId, user.id, title);

    // 4. Return updated conversation
    const conversation = await getConversationWithOwnership(
      supabase,
      conversationId,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          conversation,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to update conversation:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Check for specific error types
    if (errorMessage.includes('not found or access denied')) {
      return NextResponse.json(
        {
          error: 'Conversation not found',
          message: errorMessage,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to update conversation',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversations/[id]
 * Delete a conversation and all its messages
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const conversationId = params.id;

    // 2. Delete conversation (includes ownership check)
    await deleteConversation(supabase, conversationId, user.id);

    return NextResponse.json(
      {
        success: true,
        message: 'Conversation deleted successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to delete conversation:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Check for specific error types
    if (errorMessage.includes('not found or access denied')) {
      return NextResponse.json(
        {
          error: 'Conversation not found',
          message: errorMessage,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to delete conversation',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
