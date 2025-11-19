'use client';

import { useState, useEffect } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { Loader2 } from 'lucide-react';

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
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  // Auto-create conversation if none exists
  useEffect(() => {
    async function createInitialConversation() {
      if (conversationId || isCreatingConversation) return;

      setIsCreatingConversation(true);
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

        setConversationId(data.data.conversation.id);
      } catch (error) {
        console.error('Failed to create conversation:', error);
        setCreationError(
          error instanceof Error
            ? error.message
            : 'Failed to create conversation'
        );
      } finally {
        setIsCreatingConversation(false);
      }
    }

    createInitialConversation();
  }, [collectionId, conversationId, isCreatingConversation]);

  if (isCreatingConversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Preparing chat interface...
          </p>
        </div>
      </div>
    );
  }

  if (creationError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-sm text-red-600 mb-2">Failed to initialize chat</p>
          <p className="text-xs text-muted-foreground">{creationError}</p>
        </div>
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-16rem)]">
      <MessageList
        conversationId={conversationId}
        collectionId={collectionId}
      />
      <MessageInput conversationId={conversationId} />
    </div>
  );
}
