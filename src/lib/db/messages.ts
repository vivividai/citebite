import { SupabaseClient } from '@supabase/supabase-js';
import { Database, TablesInsert } from '@/types/database.types';

type MessageInsert = TablesInsert<'messages'>;

/**
 * Grounding chunk from custom RAG or Gemini File Search API
 * Contains the actual text that was retrieved and cited
 */
export interface GroundingChunk {
  retrievedContext?: {
    text: string;
    /** Paper ID for looking up paper metadata (custom RAG) */
    paper_id?: string;
    /** File search store reference (Gemini File Search - deprecated) */
    fileSearchStore?: string;
  };
}

/**
 * Grounding support from Gemini File Search API
 * Maps specific text segments to the chunks that support them
 */
export interface GroundingSupport {
  segment: {
    startIndex: number;
    endIndex: number;
    text: string;
  };
  groundingChunkIndices: number[];
}

/**
 * Citation metadata structure stored in messages.cited_papers JSONB field
 *
 * For Gemini File Search:
 * - chunks: Array of source text chunks from grounding metadata
 * - supports: Mapping of response text segments to chunk indices
 *
 * Legacy format (deprecated):
 * - paperId, title, relevanceScore for individual paper citations
 */
export interface CitedPaper {
  // Gemini File Search grounding data
  chunks?: GroundingChunk[];
  supports?: GroundingSupport[];

  // Legacy fields (deprecated - Gemini doesn't provide paper IDs)
  paperId?: string;
  title?: string;
  relevanceScore?: number;
  citedInContext?: string;
}

/**
 * Create a new message in a conversation
 */
export async function createMessage(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  citedPapers?: CitedPaper[]
) {
  const messageData: MessageInsert = {
    conversation_id: conversationId,
    role,
    content,
    cited_papers: citedPapers
      ? (citedPapers as unknown as Database['public']['Tables']['messages']['Insert']['cited_papers'])
      : null,
  };

  const { data: message, error } = await supabase
    .from('messages')
    .insert(messageData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create message: ${error.message}`);
  }

  return message;
}

/**
 * Get all messages for a conversation with pagination
 * Ordered by timestamp (oldest first for chat display)
 */
export async function getMessagesByConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
) {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true });

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit || 50) - 1
    );
  }

  const { data: messages, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  return messages;
}

/**
 * Pagination metadata for cursor-based pagination
 */
export interface PaginationMetadata {
  limit: number;
  hasMore: boolean;
  nextCursor?: string; // timestamp of oldest message in result (for loading older messages)
  prevCursor?: string; // timestamp of newest message in result (for loading newer messages)
}

/**
 * Result type for paginated messages
 */
export interface PaginatedMessages {
  messages: Database['public']['Tables']['messages']['Row'][];
  pagination: PaginationMetadata;
}

/**
 * Get messages for a conversation with cursor-based pagination
 * Supports bidirectional pagination using timestamps
 *
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @param options - Pagination options
 * @param options.limit - Number of messages to return (default: 50, max: 100)
 * @param options.before - Get messages before this timestamp (for loading older messages)
 * @param options.after - Get messages after this timestamp (for loading newer messages)
 * @returns Messages with pagination metadata
 */
export async function getMessagesByConversationWithCursor(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  options?: {
    limit?: number;
    before?: string;
    after?: string;
  }
): Promise<PaginatedMessages> {
  const limit = Math.min(options?.limit || 50, 100);

  // Build the query
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId);

  // Apply cursor filtering
  if (options?.before) {
    // Get messages before this timestamp (older messages)
    query = query.lt('timestamp', options.before);
  }

  if (options?.after) {
    // Get messages after this timestamp (newer messages)
    query = query.gt('timestamp', options.after);
  }

  // Fetch one extra message to determine if there are more
  const fetchLimit = limit + 1;

  // Order and limit
  query = query.order('timestamp', { ascending: true }).limit(fetchLimit);

  const { data: messages, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  if (!messages) {
    return {
      messages: [],
      pagination: {
        limit,
        hasMore: false,
      },
    };
  }

  // Check if there are more messages
  const hasMore = messages.length > limit;

  // Remove the extra message if it exists
  const resultMessages = hasMore ? messages.slice(0, limit) : messages;

  // Build pagination metadata
  const pagination: PaginationMetadata = {
    limit,
    hasMore,
  };

  if (resultMessages.length > 0) {
    // nextCursor: timestamp of oldest message (for loading older messages with ?before=)
    pagination.nextCursor =
      resultMessages[resultMessages.length - 1].timestamp || undefined;

    // prevCursor: timestamp of newest message (for loading newer messages with ?after=)
    pagination.prevCursor = resultMessages[0].timestamp || undefined;
  }

  return {
    messages: resultMessages,
    pagination,
  };
}

/**
 * Get the latest N messages from a conversation
 * Useful for including conversation context in LLM prompts
 * Returns messages in chronological order (oldest first)
 */
export async function getLatestMessages(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  count: number = 10
) {
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(count);

  if (error) {
    throw new Error(`Failed to fetch latest messages: ${error.message}`);
  }

  // Reverse to get chronological order (oldest to newest)
  return messages.reverse();
}

/**
 * Get message count for a conversation
 */
export async function getMessageCount(
  supabase: SupabaseClient<Database>,
  conversationId: string
) {
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  if (error) {
    throw new Error(`Failed to count messages: ${error.message}`);
  }

  return count || 0;
}

/**
 * Delete a message by ID
 * Note: This is a hard delete. Consider implementing soft delete if needed.
 */
export async function deleteMessage(
  supabase: SupabaseClient<Database>,
  messageId: string
) {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (error) {
    throw new Error(`Failed to delete message: ${error.message}`);
  }
}

/**
 * Get messages with citations for a conversation
 * Filters to only return assistant messages that have citations
 */
export async function getMessagesWithCitations(
  supabase: SupabaseClient<Database>,
  conversationId: string
) {
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .not('cited_papers', 'is', null)
    .order('timestamp', { ascending: true });

  if (error) {
    throw new Error(
      `Failed to fetch messages with citations: ${error.message}`
    );
  }

  return messages;
}

/**
 * Extract all unique paper IDs that have been cited in a conversation
 * Useful for analytics and tracking which papers are most referenced
 */
export async function getCitedPaperIds(
  supabase: SupabaseClient<Database>,
  conversationId: string
): Promise<string[]> {
  const messages = await getMessagesWithCitations(supabase, conversationId);

  const paperIds = new Set<string>();

  messages.forEach(message => {
    if (message.cited_papers) {
      const citations = message.cited_papers as unknown as CitedPaper[];
      citations.forEach(citation => {
        if (citation.paperId) {
          paperIds.add(citation.paperId);
        }
      });
    }
  });

  return Array.from(paperIds);
}

/**
 * Get citation statistics for a conversation
 * Returns a map of paper IDs to citation counts
 */
export async function getCitationStats(
  supabase: SupabaseClient<Database>,
  conversationId: string
): Promise<Record<string, number>> {
  const messages = await getMessagesWithCitations(supabase, conversationId);

  const citationCounts: Record<string, number> = {};

  messages.forEach(message => {
    if (message.cited_papers) {
      const citations = message.cited_papers as unknown as CitedPaper[];
      citations.forEach(citation => {
        if (citation.paperId) {
          citationCounts[citation.paperId] =
            (citationCounts[citation.paperId] || 0) + 1;
        }
      });
    }
  });

  return citationCounts;
}
