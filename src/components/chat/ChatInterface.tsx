'use client';

import { useState, useMemo } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ConversationList } from './ConversationList';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useCollectionPapers } from '@/hooks/useCollectionPapers';
import { PaperInfo } from './SourceDetailDialog';

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

  // Fetch papers for this collection to display in source dialog
  const { data: papers } = useCollectionPapers(collectionId);

  // Build paper map for efficient lookup by paper_id
  const paperMap = useMemo(() => {
    const map = new Map<string, PaperInfo>();
    if (papers) {
      for (const paper of papers) {
        map.set(paper.paper_id, {
          paper_id: paper.paper_id,
          title: paper.title,
          year: paper.year,
          authors: paper.authors,
        });
      }
    }
    return map;
  }, [papers]);

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
              paperMap={paperMap}
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
