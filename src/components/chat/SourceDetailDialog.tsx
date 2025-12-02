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
import { FileText, ExternalLink } from 'lucide-react';
import { GroundingChunk } from '@/lib/db/messages';

/**
 * Paper metadata for display in source dialog
 */
export interface PaperInfo {
  paper_id: string;
  title: string;
  year: number | null;
  authors: { name: string }[] | null;
}

interface SourceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chunk: GroundingChunk | null;
  sourceIndex: number;
  /** Map of paper_id to paper metadata for displaying paper info */
  paperMap?: Map<string, PaperInfo>;
  /** Collection ID for linking to paper detail */
  collectionId?: string;
}

export function SourceDetailDialog({
  open,
  onOpenChange,
  chunk,
  sourceIndex,
  paperMap,
  collectionId,
}: SourceDetailDialogProps) {
  if (!chunk || !chunk.retrievedContext) {
    return null;
  }

  const { text, paper_id } = chunk.retrievedContext;
  const wordCount = text.split(/\s+/).length;
  const charCount = text.length;

  // Look up paper metadata if available
  const paper = paper_id && paperMap ? paperMap.get(paper_id) : null;

  // Format authors string
  const authorsStr = paper?.authors
    ? paper.authors
        .map(a => a.name)
        .slice(0, 3)
        .join(', ') + (paper.authors.length > 3 ? ' et al.' : '')
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Source {sourceIndex + 1}
          </DialogTitle>
          <DialogDescription asChild>
            {paper ? (
              <div className="flex items-start justify-between gap-2 mt-1">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-2">
                    {paper.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {authorsStr}
                    {authorsStr && paper.year && ' · '}
                    {paper.year}
                  </p>
                </div>
                {collectionId && (
                  <a
                    href={`/collections/${collectionId}?tab=papers&highlight=${paper.paper_id}`}
                    className="shrink-0 p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors"
                    title="View paper"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : (
              <p>Retrieved context from your collection</p>
            )}
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
