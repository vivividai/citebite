'use client';

import { useState } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ConversationList } from './ConversationList';

interface ChatInterfaceProps {
  collectionId: string;
  initialConversationId?: string;
}

export function ChatInterface({
  collectionId,
  initialConversationId,
}: ChatInterfaceProps) {
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId || null
  );
  const [creationError, setCreationError] = useState<string | null>(null);

  const handleCreateConversation = async (): Promise<string> => {
    setCreationError(null);

    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collectionId,
          // title is optional - omit it to auto-generate from first message
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || data.message || 'Failed to create conversation'
        );
      }

      return data.data.conversation.id;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to create conversation';
      setCreationError(errorMessage);
      throw error;
    }
  };

  // Show error if conversation creation failed
  if (creationError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-sm text-red-600 mb-2">
            채팅을 초기화할 수 없습니다
          </p>
          <p className="text-xs text-muted-foreground">{creationError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-16rem)] gap-4">
      {/* Conversation List Sidebar */}
      <div className="w-64 border-r bg-muted/30 rounded-lg overflow-hidden flex-shrink-0">
        <ConversationList
          collectionId={collectionId}
          selectedConversationId={conversationId}
          onSelectConversation={setConversationId}
          onCreateConversation={handleCreateConversation}
        />
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {conversationId ? (
          <>
            <MessageList
              conversationId={conversationId}
              collectionId={collectionId}
            />
            <MessageInput conversationId={conversationId} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <p className="text-sm text-muted-foreground">
                왼쪽에서 대화를 선택하거나 새 대화를 시작하세요
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
