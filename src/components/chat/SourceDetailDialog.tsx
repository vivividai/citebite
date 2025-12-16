'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  ExternalLink,
  ImageIcon,
  TableIcon,
  BarChart3,
  GitBranch,
} from 'lucide-react';
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

/**
 * Get icon component for chunk type
 */
function getChunkIcon(chunkType?: 'text' | 'figure', figureNumber?: string) {
  if (chunkType !== 'figure') return FileText;

  if (!figureNumber) return ImageIcon;

  const lower = figureNumber.toLowerCase();
  if (lower.includes('table')) return TableIcon;
  if (lower.includes('chart')) return BarChart3;
  if (lower.includes('diagram') || lower.includes('scheme')) return GitBranch;
  return ImageIcon;
}

/**
 * Get the accent color class based on chunk type
 */
function getAccentColor(chunkType?: 'text' | 'figure') {
  return chunkType === 'figure' ? 'emerald' : 'blue';
}

export function SourceDetailDialog({
  open,
  onOpenChange,
  chunk,
  sourceIndex,
  paperMap,
  collectionId,
}: SourceDetailDialogProps) {
  const [imageError, setImageError] = useState(false);

  if (!chunk || !chunk.retrievedContext) {
    return null;
  }

  const {
    text,
    paper_id,
    chunk_type,
    figure_number,
    figure_caption,
    image_url,
    page_number,
    is_related,
  } = chunk.retrievedContext;

  const isFigure = chunk_type === 'figure';
  const ChunkIcon = getChunkIcon(chunk_type, figure_number);
  const accentColor = getAccentColor(chunk_type);

  // Text statistics
  const wordCount = text?.split(/\s+/).length || 0;
  const charCount = text?.length || 0;

  // Look up paper metadata if available
  const paper = paper_id && paperMap ? paperMap.get(paper_id) : null;

  // Format authors string
  const authorsStr = paper?.authors
    ? paper.authors
        .map(a => a.name)
        .slice(0, 3)
        .join(', ') + (paper.authors.length > 3 ? ' et al.' : '')
    : null;

  // Dialog title
  const title = isFigure
    ? figure_number || `Figure ${sourceIndex + 1}`
    : `Source ${sourceIndex + 1}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-3xl max-h-[80vh] flex flex-col ${isFigure ? 'max-w-4xl' : ''}`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChunkIcon className={`h-5 w-5 text-${accentColor}-600`} />
            {title}
            {is_related && (
              <Badge
                variant="outline"
                className="ml-2 text-xs text-purple-600 border-purple-200"
              >
                Related
              </Badge>
            )}
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
                    {page_number && ` · Page ${page_number}`}
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
          {/* Figure Image (for figure chunks) */}
          {isFigure && (
            <div className="relative bg-gray-50 rounded-lg overflow-hidden border">
              {image_url && !imageError ? (
                <div className="relative min-h-[250px] max-h-[45vh]">
                  <Image
                    src={image_url}
                    alt={figure_caption || figure_number || 'Figure'}
                    fill
                    className="object-contain p-4"
                    sizes="(max-width: 768px) 100vw, 800px"
                    onError={() => setImageError(true)}
                    priority
                  />
                </div>
              ) : (
                <div className="h-[200px] flex flex-col items-center justify-center text-gray-400">
                  <ChunkIcon className="h-16 w-16 mb-2" />
                  <p className="text-sm">Image not available</p>
                </div>
              )}
            </div>
          )}

          {/* Figure Caption (for figure chunks) */}
          {isFigure && figure_caption && (
            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="text-xs font-medium text-gray-500 mb-1">Caption</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {figure_caption}
              </p>
            </div>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap gap-2">
            {!isFigure && (
              <>
                <Badge variant="outline" className="text-xs">
                  {wordCount} words
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {charCount} characters
                </Badge>
              </>
            )}
            {isFigure && page_number && (
              <Badge variant="outline" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                Page {page_number}
              </Badge>
            )}
            {isFigure && (
              <Badge
                variant="outline"
                className={`text-xs text-${accentColor}-600 border-${accentColor}-200`}
              >
                <ChunkIcon className="h-3 w-3 mr-1" />
                {figure_number?.toLowerCase().includes('table')
                  ? 'Table'
                  : 'Figure'}
              </Badge>
            )}
          </div>

          {/* Source Text / Description */}
          {text && (
            <Card className={`border-l-4 border-l-${accentColor}-500`}>
              <CardContent className="p-4">
                {isFigure && text !== figure_caption && (
                  <p className="text-xs font-medium text-blue-600 mb-2">
                    AI Analysis
                  </p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {text}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Footer Info */}
          <p className="text-xs text-muted-foreground">
            {isFigure
              ? 'This figure was extracted and analyzed from your indexed papers.'
              : 'This content was retrieved from your indexed papers and used to generate the AI response.'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
