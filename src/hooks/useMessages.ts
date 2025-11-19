import { useQuery } from '@tanstack/react-query';
import { Database } from '@/types/database.types';

type Message = Database['public']['Tables']['messages']['Row'];

export interface CitedPaper {
  paperId: string;
  title: string;
  relevanceScore?: number;
  citedInContext?: string;
}

interface PaginationMetadata {
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
  prevCursor?: string;
}

interface MessagesResponse {
  success: boolean;
  data: {
    messages: Message[];
    pagination: PaginationMetadata;
  };
}

// Custom error class to track status codes
class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface UseMessagesOptions {
  limit?: number;
  before?: string;
  after?: string;
}

/**
 * Hook to fetch messages for a specific conversation with pagination
 */
export function useMessages(
  conversationId: string,
  options?: UseMessagesOptions
) {
  const { limit = 50, before, after } = options || {};

  return useQuery({
    queryKey: [
      'conversations',
      conversationId,
      'messages',
      { limit, before, after },
    ],
    queryFn: async (): Promise<MessagesResponse['data']> => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (before) params.set('before', before);
      if (after) params.set('after', after);

      const res = await fetch(
        `/api/conversations/${conversationId}/messages?${params.toString()}`
      );

      if (!res.ok) {
        const error = await res.json();
        throw new ApiError(
          error.message || 'Failed to fetch messages',
          res.status
        );
      }

      const data: MessagesResponse = await res.json();
      return data.data;
    },
    staleTime: 10 * 1000, // 10 seconds
    enabled: !!conversationId, // Only run query if conversationId is provided
  });
}
