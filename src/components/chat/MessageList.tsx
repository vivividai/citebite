'use client';

import { useEffect, useRef } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { useMessages } from '@/hooks/useMessages';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { PendingSteps } from './PendingSteps';
import { CitedPaper } from './CitationCard';
import { PaperInfo } from './SourceDetailDialog';

interface MessageListProps {
  conversationId: string;
  collectionId: string;
  isPending?: boolean;
  /** Map of paper_id to paper metadata for displaying paper info in source dialog */
  paperMap?: Map<string, PaperInfo>;
}

export function MessageList({
  conversationId,
  collectionId,
  isPending = false,
  paperMap,
}: MessageListProps) {
  const { data, isLoading, error } = useMessages(conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or pending state changes
  useEffect(() => {
    if ((data?.messages || isPending) && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [data?.messages, isPending]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-sm text-red-600">Failed to load messages</p>
          <p className="text-xs text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  const messages = data?.messages || [];

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="text-center max-w-md">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Ask questions about the papers in this collection and get AI-powered
            answers with citations.
          </p>
          <div className="space-y-2 text-left">
            <p className="text-xs font-medium text-muted-foreground">
              Example questions:
            </p>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                • What are the main findings in this collection?
              </p>
              <p className="text-xs text-muted-foreground">
                • How do these papers approach [specific topic]?
              </p>
              <p className="text-xs text-muted-foreground">
                • What are the limitations discussed in these studies?
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
    >
      {messages.map(message => {
        if (message.role === 'user') {
          return (
            <UserMessage
              key={message.id}
              content={message.content}
              timestamp={message.timestamp}
            />
          );
        }

        // Parse cited_papers from JSONB
        const citedPapers = message.cited_papers
          ? (message.cited_papers as unknown as CitedPaper[])
          : [];

        return (
          <AssistantMessage
            key={message.id}
            content={message.content}
            timestamp={message.timestamp}
            citedPapers={citedPapers}
            collectionId={collectionId}
            paperMap={paperMap}
          />
        );
      })}
      {isPending && <PendingSteps />}
      <div ref={messagesEndRef} />
    </div>
  );
}
