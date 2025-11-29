'use client';

import { useState } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ConversationList } from './ConversationList';
import { useSendMessage } from '@/hooks/useSendMessage';

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

  // Shared sendMessage mutation for optimistic UI and pending state
  const sendMessage = useSendMessage();

  const handleStartNewConversation = () => {
    // Don't create conversation immediately, just set to null
    // Conversation will be created when first message is sent
    setConversationId(null);
  };

  return (
    <div className="flex h-[calc(100vh-16rem)] gap-4">
      {/* Conversation List Sidebar */}
      <div className="w-64 border-r bg-muted/30 rounded-lg overflow-hidden flex-shrink-0">
        <ConversationList
          collectionId={collectionId}
          selectedConversationId={conversationId}
          onSelectConversation={setConversationId}
          onStartNewConversation={handleStartNewConversation}
        />
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {conversationId ? (
          <>
            <MessageList
              conversationId={conversationId}
              collectionId={collectionId}
              isPending={sendMessage.isPending}
            />
            <MessageInput
              conversationId={conversationId}
              sendMessageMutation={sendMessage}
            />
          </>
        ) : (
          <>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <p className="text-sm text-muted-foreground">
                  새 대화를 시작하려면 아래에 첫 메시지를 입력하세요
                </p>
              </div>
            </div>
            <MessageInput
              conversationId={null}
              collectionId={collectionId}
              onConversationCreated={setConversationId}
              sendMessageMutation={sendMessage}
            />
          </>
        )}
      </div>
    </div>
  );
}
