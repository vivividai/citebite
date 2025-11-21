'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { GroundingChunk } from '@/lib/db/messages';

interface SourceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chunk: GroundingChunk | null;
  sourceIndex: number;
}

export function SourceDetailDialog({
  open,
  onOpenChange,
  chunk,
  sourceIndex,
}: SourceDetailDialogProps) {
  if (!chunk || !chunk.retrievedContext) {
    return null;
  }

  const { text, fileSearchStore } = chunk.retrievedContext;
  const wordCount = text.split(/\s+/).length;
  const charCount = text.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Source {sourceIndex + 1}
          </DialogTitle>
          <DialogDescription>
            Retrieved context from your collection
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Metadata */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs">
              {wordCount} words
            </Badge>
            <Badge variant="outline" className="text-xs">
              {charCount} characters
            </Badge>
            {fileSearchStore && (
              <Badge variant="outline" className="text-xs font-mono">
                {fileSearchStore.split('/').pop()}
              </Badge>
            )}
          </div>

          {/* Source Text */}
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {text}
              </p>
            </CardContent>
          </Card>

          {/* Footer Info */}
          <p className="text-xs text-muted-foreground">
            This content was retrieved from your indexed papers and used to
            generate the AI response.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
