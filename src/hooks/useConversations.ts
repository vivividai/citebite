import { useQuery } from '@tanstack/react-query';
import { Database } from '@/types/database.types';

type Conversation = Database['public']['Tables']['conversations']['Row'];

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

interface ConversationsResponse {
  success: boolean;
  data: {
    conversations: Conversation[];
  };
}

/**
 * Hook to fetch all conversations for a specific collection
 * Ordered by most recent activity first
 */
export function useConversations(collectionId: string) {
  return useQuery({
    queryKey: ['collections', collectionId, 'conversations'],
    queryFn: async (): Promise<Conversation[]> => {
      const params = new URLSearchParams();
      params.set('collectionId', collectionId);

      const res = await fetch(`/api/conversations?${params.toString()}`);

      if (!res.ok) {
        const error = await res.json();
        throw new ApiError(
          error.message || 'Failed to fetch conversations',
          res.status
        );
      }

      const data: ConversationsResponse = await res.json();
      return data.data.conversations;
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!collectionId, // Only run query if collectionId is provided
  });
}
