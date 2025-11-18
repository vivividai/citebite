import { SupabaseClient } from '@supabase/supabase-js';
import { Database, TablesInsert } from '@/types/database.types';

type ConversationInsert = TablesInsert<'conversations'>;

/**
 * Create a new conversation for a collection
 */
export async function createConversation(
  supabase: SupabaseClient<Database>,
  collectionId: string,
  userId: string,
  title?: string
) {
  const conversationData: ConversationInsert = {
    collection_id: collectionId,
    user_id: userId,
    title: title || null,
  };

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert(conversationData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return conversation;
}

/**
 * Get conversation by ID with ownership check
 */
export async function getConversationWithOwnership(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string
) {
  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Conversation not found or access denied');
    }
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  return conversation;
}

/**
 * Get conversation by ID (without ownership check)
 * Useful for server-side operations where ownership is already verified
 */
export async function getConversationById(
  supabase: SupabaseClient<Database>,
  conversationId: string
) {
  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Conversation not found');
    }
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  return conversation;
}

/**
 * Get all conversations for a specific collection
 * Ordered by most recent activity first
 */
export async function getConversationsByCollection(
  supabase: SupabaseClient<Database>,
  collectionId: string,
  userId: string
) {
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('collection_id', collectionId)
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to fetch conversations: ${error.message}`);
  }

  return conversations;
}

/**
 * Get all conversations for a user across all collections
 * Ordered by most recent activity first
 */
export async function getConversationsByUser(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(
      `
      *,
      collections (
        id,
        name
      )
    `
    )
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to fetch user conversations: ${error.message}`);
  }

  return conversations;
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string,
  title: string
) {
  // First verify ownership
  await getConversationWithOwnership(supabase, conversationId, userId);

  const { error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to update conversation title: ${error.message}`);
  }
}

/**
 * Update the last message timestamp for a conversation
 * Called automatically when a new message is added
 */
export async function updateLastMessageAt(
  supabase: SupabaseClient<Database>,
  conversationId: string
) {
  const { error } = await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to update last message time: ${error.message}`);
  }
}

/**
 * Delete a conversation with ownership check
 * This will cascade delete all related messages
 */
export async function deleteConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string
) {
  // First verify ownership
  await getConversationWithOwnership(supabase, conversationId, userId);

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete conversation: ${error.message}`);
  }
}

/**
 * Get conversation with message count
 */
export async function getConversationWithMessageCount(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string
) {
  const conversation = await getConversationWithOwnership(
    supabase,
    conversationId,
    userId
  );

  // Get message count
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  if (error) {
    console.error(
      `Failed to get message count for conversation ${conversationId}:`,
      error
    );
  }

  return {
    ...conversation,
    messageCount: count || 0,
  };
}
