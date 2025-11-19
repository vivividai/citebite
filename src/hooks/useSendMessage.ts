import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

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

/**
 * Hook to send a message in a conversation
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
    onSuccess: (data, variables) => {
      // Invalidate messages query to refetch the list
      queryClient.invalidateQueries({
        queryKey: ['conversations', variables.conversationId, 'messages'],
      });

      // Invalidate conversation query to update last_message_at
      queryClient.invalidateQueries({
        queryKey: ['conversations', variables.conversationId],
      });
    },
    onError: (error: Error) => {
      // Show error toast
      toast.error(error.message || 'Failed to send message');
    },
  });
}
