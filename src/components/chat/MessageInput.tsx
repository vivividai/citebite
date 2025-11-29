'use client';

import { useState, KeyboardEvent, FormEvent, useRef } from 'react';
import { Send, Loader2, AlertCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useQueryClient } from '@tanstack/react-query';

type SendMessageMutation = ReturnType<typeof useSendMessage>;

interface MessageInputProps {
  conversationId: string | null;
  collectionId?: string;
  onConversationCreated?: (conversationId: string) => void;
  disabled?: boolean;
  sendMessageMutation?: SendMessageMutation;
}

export function MessageInput({
  conversationId,
  collectionId,
  onConversationCreated,
  disabled = false,
  sendMessageMutation,
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const internalSendMessage = useSendMessage();
  const sendMessage = sendMessageMutation || internalSendMessage;
  const queryClient = useQueryClient();
  const lastSentMessageRef = useRef<string | null>(null);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();

    const trimmedMessage = message.trim();
    if (!trimmedMessage || sendMessage.isPending || isCreatingConversation)
      return;

    setError(null);

    // Clear input immediately for better UX (optimistic UI)
    const messageToSend = trimmedMessage;
    setMessage('');
    lastSentMessageRef.current = messageToSend;

    try {
      let targetConversationId = conversationId;

      // If no conversation exists, create one first
      if (!targetConversationId) {
        if (!collectionId) {
          throw new Error('Collection ID is required to create conversation');
        }

        setIsCreatingConversation(true);
        try {
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              collectionId,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(
              data.error || data.message || 'Failed to create conversation'
            );
          }

          targetConversationId = data.data.conversation.id as string;
          onConversationCreated?.(targetConversationId);

          // Invalidate conversations query to show new conversation in list
          if (collectionId) {
            queryClient.invalidateQueries({
              queryKey: ['collections', collectionId, 'conversations'],
            });
          }
        } finally {
          setIsCreatingConversation(false);
        }
      }

      // Send message to the conversation
      await sendMessage.mutateAsync({
        conversationId: targetConversationId,
        content: messageToSend,
      });
      lastSentMessageRef.current = null;
    } catch (err) {
      // Restore message on error so user can retry
      if (lastSentMessageRef.current) {
        setMessage(lastSentMessageRef.current);
        lastSentMessageRef.current = null;
      }
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Cmd/Ctrl + Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isDisabled =
    disabled || sendMessage.isPending || isCreatingConversation;
  const canSend = message.trim().length > 0 && !isDisabled;

  const getPlaceholder = () => {
    if (isCreatingConversation) return 'Creating conversation...';
    if (sendMessage.isPending) return 'Waiting for response...';
    return 'Ask a question about the papers... (Cmd/Ctrl + Enter to send)';
  };

  return (
    <div className="border-t bg-white p-4">
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-600">{error}</p>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-red-700 hover:text-red-800"
              onClick={() => handleSubmit()}
            >
              Try again
            </Button>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder()}
          disabled={isDisabled}
          className="min-h-[80px] max-h-[200px] resize-none"
          rows={3}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          className="h-[80px] w-12 shrink-0"
        >
          {sendMessage.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground mt-2">
        AI responses include citations to papers in your collection
      </p>
    </div>
  );
}
