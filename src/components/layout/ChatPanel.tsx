'use client';

import { useState, useMemo, useEffect } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useCollectionPapers } from '@/hooks/useCollectionPapers';
import { useConversations } from '@/hooks/useConversations';
import { PaperInfo } from '@/components/chat/SourceDetailDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { MessageSquare, Plus, Loader2 } from 'lucide-react';

/**
 * Empty state when no collection is selected
 */
function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="text-center max-w-xs">
        <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-sm font-semibold mb-1">Start a Conversation</h3>
        <p className="text-xs text-muted-foreground">
          Select a collection to chat with your research papers using AI.
        </p>
      </div>
    </div>
  );
}

/**
 * Chat panel for the dashboard
 * Includes conversation switcher and chat interface
 */
export function ChatPanel() {
  const { selectedCollectionId, collection } = useDashboard();
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Fetch conversations for the selected collection
  const { data: conversations, isLoading: isLoadingConversations } =
    useConversations(selectedCollectionId ?? '');

  // Shared sendMessage mutation for optimistic UI and pending state
  const sendMessage = useSendMessage();

  // Fetch papers for this collection to display in source dialog
  const { data: papers } = useCollectionPapers(selectedCollectionId ?? '');

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

  // Reset conversation when collection changes
  useEffect(() => {
    setConversationId(null);
  }, [selectedCollectionId]);

  // Handle starting a new conversation
  const handleStartNewConversation = () => {
    setConversationId(null);
  };

  // Show empty state if no collection selected
  if (!selectedCollectionId || !collection) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Chat
          </h2>
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with conversation switcher */}
      <div className="border-b px-4 py-3 space-y-2">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Chat
        </h2>

        {/* Conversation switcher */}
        <div className="flex gap-2">
          <Select
            value={conversationId ?? 'new'}
            onValueChange={value =>
              setConversationId(value === 'new' ? null : value)
            }
          >
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue placeholder="Select conversation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">
                <span className="flex items-center gap-2">
                  <Plus className="h-3 w-3" />
                  New Conversation
                </span>
              </SelectItem>
              {isLoadingConversations ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                conversations?.map(conv => (
                  <SelectItem key={conv.id} value={conv.id}>
                    <span className="truncate">
                      {conv.title || 'Untitled Conversation'}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleStartNewConversation}
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {conversationId ? (
          <>
            <MessageList
              conversationId={conversationId}
              collectionId={collection.id}
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
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center max-w-xs">
                <p className="text-sm text-muted-foreground">
                  Start a new conversation by typing your first message below
                </p>
              </div>
            </div>
            <MessageInput
              conversationId={null}
              collectionId={collection.id}
              onConversationCreated={setConversationId}
              sendMessageMutation={sendMessage}
            />
          </>
        )}
      </div>
    </div>
  );
}
