import { SupabaseClient } from '@supabase/supabase-js';
import { Database, TablesInsert } from '@/types/database.types';

type MessageInsert = TablesInsert<'messages'>;

/**
 * Citation metadata structure stored in messages.cited_papers JSONB field
 */
export interface CitedPaper {
  paperId: string;
  title: string;
  relevanceScore?: number;
  citedInContext?: string; // The specific context where this paper was cited
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
        paperIds.add(citation.paperId);
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
        citationCounts[citation.paperId] =
          (citationCounts[citation.paperId] || 0) + 1;
      });
    }
  });

  return citationCounts;
}
