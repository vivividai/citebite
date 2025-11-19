'use client';

import { User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface UserMessageProps {
  content: string;
  timestamp: string | null;
}

export function UserMessage({ content, timestamp }: UserMessageProps) {
  const timeAgo = timestamp
    ? formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    : null;

  return (
    <div className="flex gap-3 justify-end">
      <div className="flex flex-col items-end max-w-[80%]">
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
          <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        </div>
        {timeAgo && (
          <span className="text-xs text-muted-foreground mt-1">{timeAgo}</span>
        )}
      </div>
      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
        <User className="h-4 w-4 text-blue-600" />
      </div>
    </div>
  );
}
