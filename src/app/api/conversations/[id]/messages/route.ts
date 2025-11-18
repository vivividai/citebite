import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  sendMessageSchema,
  getMessagesSchema,
} from '@/lib/validations/conversations';
import { getConversationWithOwnership } from '@/lib/db/conversations';
import { getCollectionWithOwnership } from '@/lib/db/collections';
import { getCollectionPapers } from '@/lib/db/papers';
import {
  createMessage,
  getLatestMessages,
  getMessagesByConversationWithCursor,
} from '@/lib/db/messages';
import { updateLastMessageAt } from '@/lib/db/conversations';
import { queryWithFileSearch } from '@/lib/gemini/chat';
import { validateAndEnrichCitations } from '@/lib/citations/validator';

/**
 * GET /api/conversations/[id]/messages
 *
 * Retrieve messages from a conversation with cursor-based pagination
 *
 * Query parameters:
 * - limit: number (1-100, default 50)
 * - before: ISO datetime string (get messages before this timestamp)
 * - after: ISO datetime string (get messages after this timestamp)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryParams = {
      limit: searchParams.get('limit'),
      before: searchParams.get('before'),
      after: searchParams.get('after'),
    };

    const result = getMessagesSchema.safeParse(queryParams);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: result.error.issues,
        },
        { status: 400 }
      );
    }

    const { limit, before, after } = result.data;

    // 3. Verify conversation exists and user has access
    await getConversationWithOwnership(supabase, conversationId, user.id);

    // 4. Fetch messages with cursor-based pagination
    const { messages, pagination } = await getMessagesByConversationWithCursor(
      supabase,
      conversationId,
      { limit, before, after }
    );

    // 5. Return messages with pagination metadata
    return NextResponse.json(
      {
        success: true,
        data: {
          messages,
          pagination,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      '[API] Error in GET /api/conversations/[id]/messages:',
      error
    );

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Handle specific error types
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('access denied')
    ) {
      return NextResponse.json(
        {
          error: 'Not found',
          message: errorMessage,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations/[id]/messages
 *
 * Send a message in a conversation and get AI response with citations
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

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
    const result = sendMessageSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: result.error.issues,
        },
        { status: 400 }
      );
    }

    const { content: userMessage } = result.data;

    // 3. Verify conversation exists and user has access
    const conversation = await getConversationWithOwnership(
      supabase,
      conversationId,
      user.id
    );

    // 4. Get collection and verify file search store exists
    const collection = await getCollectionWithOwnership(
      supabase,
      conversation.collection_id,
      user.id
    );

    if (!collection.file_search_store_id) {
      return NextResponse.json(
        {
          error: 'Collection has no papers indexed yet',
          message:
            'Please wait for papers to be indexed before starting a conversation.',
        },
        { status: 400 }
      );
    }

    // 5. Get all papers in the collection (for citation validation)
    const collectionPapers = await getCollectionPapers(supabase, collection.id);

    const collectionPaperIds = collectionPapers.map(p => p.paper_id);

    if (collectionPaperIds.length === 0) {
      return NextResponse.json(
        {
          error: 'Collection has no papers',
          message:
            'Add papers to the collection before starting a conversation.',
        },
        { status: 400 }
      );
    }

    // 6. Get conversation history (last 10 messages for context)
    const conversationHistory = await getLatestMessages(
      supabase,
      conversationId,
      10
    );

    // Format history for Gemini
    const formattedHistory = conversationHistory.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // 7. Query Gemini with File Search
    console.log(
      `[API] Querying Gemini for conversation ${conversationId} with ${formattedHistory.length} history messages`
    );

    let aiResponse;
    try {
      aiResponse = await queryWithFileSearch(
        collection.file_search_store_id,
        userMessage,
        formattedHistory,
        collectionPaperIds
      );
    } catch (error) {
      console.error('[API] Gemini query error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return NextResponse.json(
        {
          error: 'Failed to generate AI response',
          message: errorMessage,
        },
        { status: 500 }
      );
    }

    // 8. Validate and enrich citations
    console.log(`[API] Validating ${aiResponse.citedPapers.length} citations`);

    let validatedCitations;
    try {
      validatedCitations = await validateAndEnrichCitations(
        supabase,
        aiResponse.citedPapers,
        collection.id
      );
    } catch (error) {
      console.error('[API] Citation validation error:', error);
      // Continue with unvalidated citations rather than failing
      validatedCitations = aiResponse.citedPapers;
    }

    // 9. Save user message
    const userMessageRecord = await createMessage(
      supabase,
      conversationId,
      'user',
      userMessage
    );

    // 10. Save AI response with citations
    const assistantMessageRecord = await createMessage(
      supabase,
      conversationId,
      'assistant',
      aiResponse.answer,
      validatedCitations.length > 0 ? validatedCitations : undefined
    );

    // 11. Update conversation's last_message_at timestamp
    await updateLastMessageAt(supabase, conversationId);

    // 12. Return success response
    return NextResponse.json(
      {
        success: true,
        data: {
          userMessage: {
            id: userMessageRecord.id,
            role: userMessageRecord.role,
            content: userMessageRecord.content,
            timestamp: userMessageRecord.timestamp,
          },
          assistantMessage: {
            id: assistantMessageRecord.id,
            role: assistantMessageRecord.role,
            content: assistantMessageRecord.content,
            cited_papers: validatedCitations,
            timestamp: assistantMessageRecord.timestamp,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      '[API] Error in POST /api/conversations/[id]/messages:',
      error
    );

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Handle specific error types
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('access denied')
    ) {
      return NextResponse.json(
        {
          error: 'Not found',
          message: errorMessage,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
