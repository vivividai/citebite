import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Database } from '@/types/database.types';

type Message = Database['public']['Tables']['messages']['Row'];

export interface SendMessageInput {
  conversationId: string;
  content: string;
}

export interface CitedPaper {
  paperId: string;
  title: string;
  relevanceScore?: number;
  citedInContext?: string;
}

interface SendMessageResponse {
  success: boolean;
  data: {
    userMessage: {
      id: string;
      role: string;
      content: string;
      timestamp: string;
    };
    assistantMessage: {
      id: string;
      role: string;
      content: string;
      cited_papers: CitedPaper[];
      timestamp: string;
    };
  };
}

interface MessagesData {
  messages: Message[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}

interface MutationContext {
  previousMessages: MessagesData | undefined;
}

/**
 * Hook to send a message in a conversation
 * Includes optimistic UI updates - user message appears immediately
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
    }: SendMessageInput): Promise<SendMessageResponse> => {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(
          responseData.error || responseData.message || 'Failed to send message'
        );
      }

      return responseData;
    },

    onMutate: async ({ conversationId, content }): Promise<MutationContext> => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ['conversations', conversationId, 'messages'],
      });

      // Get the query key with default pagination options
      const queryKey = [
        'conversations',
        conversationId,
        'messages',
        { limit: 50, before: undefined, after: undefined },
      ];

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<MessagesData>(queryKey);

      // Optimistically add user message
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user',
        content,
        cited_papers: null,
        timestamp: new Date().toISOString(),
      };

      queryClient.setQueryData<MessagesData>(queryKey, old => {
        if (!old) {
          return {
            messages: [optimisticMessage],
            pagination: { limit: 50, hasMore: false },
          };
        }
        return {
          ...old,
          messages: [...old.messages, optimisticMessage],
        };
      });

      // Return context with previous value for rollback
      return { previousMessages };
    },

    onError: (error: Error, variables, context) => {
      // Rollback to previous state on error
      if (context?.previousMessages) {
        const queryKey = [
          'conversations',
          variables.conversationId,
          'messages',
          { limit: 50, before: undefined, after: undefined },
        ];
        queryClient.setQueryData(queryKey, context.previousMessages);
      }

      // Show error toast
      toast.error(error.message || 'Failed to send message');
    },

    onSettled: (_data, _error, variables) => {
      // Always refetch after mutation settles to ensure server state is synced
      queryClient.invalidateQueries({
        queryKey: ['conversations', variables.conversationId, 'messages'],
      });

      // Invalidate conversation query to update last_message_at
      queryClient.invalidateQueries({
        queryKey: ['conversations', variables.conversationId],
      });
    },
  });
}
