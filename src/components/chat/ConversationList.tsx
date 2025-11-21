'use client';

import { useState } from 'react';
import { useConversations } from '@/hooks/useConversations';
import { ConversationItem } from './ConversationItem';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface ConversationListProps {
  collectionId: string;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => Promise<string>;
}

export function ConversationList({
  collectionId,
  selectedConversationId,
  onSelectConversation,
  onCreateConversation,
}: ConversationListProps) {
  const {
    data: conversations,
    isLoading,
    error,
  } = useConversations(collectionId);
  const [isCreating, setIsCreating] = useState(false);
  const queryClient = useQueryClient();

  const handleCreateConversation = async () => {
    setIsCreating(true);
    try {
      const newConversationId = await onCreateConversation();
      onSelectConversation(newConversationId);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRename = async (id: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newTitle }),
      });

      if (!res.ok) {
        throw new Error('Failed to rename conversation');
      }

      // Invalidate conversations query to refetch
      queryClient.invalidateQueries({
        queryKey: ['collections', collectionId, 'conversations'],
      });
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete conversation');
      }

      // If the deleted conversation was selected, select another one
      if (
        selectedConversationId === id &&
        conversations &&
        conversations.length > 1
      ) {
        const remainingConversations = conversations.filter(c => c.id !== id);
        if (remainingConversations.length > 0) {
          onSelectConversation(remainingConversations[0].id);
        }
      }

      // Invalidate conversations query to refetch
      queryClient.invalidateQueries({
        queryKey: ['collections', collectionId, 'conversations'],
      });
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">
          대화 목록 로딩 중...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive mt-2">
          대화 목록을 불러올 수 없습니다
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button
          onClick={handleCreateConversation}
          disabled={isCreating}
          className="w-full gap-2"
          variant="outline"
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              생성 중...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />새 대화
            </>
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations && conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <p className="text-sm text-muted-foreground">
              아직 대화가 없습니다
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              새 대화를 시작해보세요
            </p>
          </div>
        ) : (
          conversations?.map(conversation => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isActive={selectedConversationId === conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
