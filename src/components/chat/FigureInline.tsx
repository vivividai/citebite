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
import { Badge } from '@/components/ui/badge';
import {
  ImageIcon,
  TableIcon,
  BarChart3,
  GitBranch,
  Maximize2,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GroundingChunk } from '@/lib/db/messages';

/**
 * Paper info for displaying figure source
 */
interface PaperInfo {
  paper_id: string;
  title: string;
  year: number | null;
  authors: { name: string }[] | null;
}

interface FigureInlineProps {
  /** The grounding chunk containing figure data */
  chunk: GroundingChunk;
  /** 0-indexed source number for display */
  sourceIndex: number;
  /** Paper metadata map for displaying paper info */
  paperMap?: Map<string, PaperInfo>;
  /** Collection ID for linking to paper */
  collectionId?: string;
  /** Compact mode for inline display (default: false) */
  compact?: boolean;
  /** Whether this is a related figure (not directly searched) */
  isRelated?: boolean;
}

/**
 * Get icon component for figure type
 */
function getFigureIcon(figureNumber?: string) {
  if (!figureNumber) return ImageIcon;

  const lower = figureNumber.toLowerCase();
  if (lower.includes('table')) return TableIcon;
  if (lower.includes('chart')) return BarChart3;
  if (lower.includes('diagram') || lower.includes('scheme')) return GitBranch;
  return ImageIcon;
}

/**
 * Get figure type label
 */
function getFigureType(figureNumber?: string): string {
  if (!figureNumber) return 'Figure';

  const lower = figureNumber.toLowerCase();
  if (lower.includes('table')) return 'Table';
  if (lower.includes('chart')) return 'Chart';
  if (lower.includes('diagram')) return 'Diagram';
  if (lower.includes('scheme')) return 'Scheme';
  return 'Figure';
}

/**
 * FigureInline displays a figure from RAG results with optional expansion
 *
 * Features:
 * - Thumbnail view with expand option
 * - Full-screen dialog for detailed viewing
 * - Shows caption and description
 * - Links to source paper
 */
export function FigureInline({
  chunk,
  sourceIndex,
  paperMap,
  collectionId,
  compact = false,
  isRelated = false,
}: FigureInlineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const ctx = chunk.retrievedContext;
  if (!ctx) return null;

  const { paper_id, figure_number, figure_caption, image_url } = ctx;

  const FigureIcon = getFigureIcon(figure_number);
  const figureType = getFigureType(figure_number);
  const paper = paper_id && paperMap ? paperMap.get(paper_id) : null;

  // Format authors string
  const authorsStr = paper?.authors
    ? paper.authors
        .map(a => a.name)
        .slice(0, 2)
        .join(', ') + (paper.authors.length > 2 ? ' et al.' : '')
    : null;

  // Compact inline badge (for use in sources list)
  if (compact) {
    return (
      <>
        <button
          onClick={() => setIsExpanded(true)}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors',
            isRelated
              ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          )}
        >
          <FigureIcon className="h-3.5 w-3.5" />
          <span className="font-medium">
            {figure_number || `${figureType} ${sourceIndex + 1}`}
          </span>
          {isRelated && (
            <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1">
              Related
            </Badge>
          )}
        </button>

        <FigureDialog
          open={isExpanded}
          onOpenChange={setIsExpanded}
          chunk={chunk}
          sourceIndex={sourceIndex}
          paper={paper}
          authorsStr={authorsStr}
          collectionId={collectionId}
          imageError={imageError}
          setImageError={setImageError}
        />
      </>
    );
  }

  // Full inline card (for related figures section)
  return (
    <>
      <div
        className={cn(
          'group relative rounded-lg border overflow-hidden cursor-pointer transition-all hover:shadow-md',
          isRelated
            ? 'border-purple-200 bg-purple-50/50'
            : 'border-emerald-200 bg-emerald-50/50'
        )}
        onClick={() => setIsExpanded(true)}
      >
        {/* Image thumbnail */}
        <div className="relative aspect-video bg-gray-100 overflow-hidden">
          {image_url && !imageError ? (
            <Image
              src={image_url}
              alt={figure_caption || figure_number || 'Figure'}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 300px"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <FigureIcon className="h-12 w-12 text-gray-300" />
            </div>
          )}

          {/* Expand overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
        </div>

        {/* Caption */}
        <div className="p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <FigureIcon className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-700">
              {figure_number || figureType}
            </span>
            {isRelated && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1 ml-auto"
              >
                Related
              </Badge>
            )}
          </div>
          {figure_caption && (
            <p className="text-xs text-gray-600 line-clamp-2">
              {figure_caption}
            </p>
          )}
          {paper && (
            <p className="text-[10px] text-gray-400 mt-1 truncate">
              {paper.title}
            </p>
          )}
        </div>
      </div>

      <FigureDialog
        open={isExpanded}
        onOpenChange={setIsExpanded}
        chunk={chunk}
        sourceIndex={sourceIndex}
        paper={paper}
        authorsStr={authorsStr}
        collectionId={collectionId}
        imageError={imageError}
        setImageError={setImageError}
      />
    </>
  );
}

/**
 * Figure detail dialog
 */
interface FigureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chunk: GroundingChunk;
  sourceIndex: number;
  paper?: PaperInfo | null;
  authorsStr?: string | null;
  collectionId?: string;
  imageError: boolean;
  setImageError: (error: boolean) => void;
}

function FigureDialog({
  open,
  onOpenChange,
  chunk,
  sourceIndex,
  paper,
  authorsStr,
  collectionId,
  imageError,
  setImageError,
}: FigureDialogProps) {
  const ctx = chunk.retrievedContext;
  if (!ctx) return null;

  const { text, figure_number, figure_caption, image_url, page_number } = ctx;

  const FigureIcon = getFigureIcon(figure_number);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <FigureIcon className="h-5 w-5 text-emerald-600" />
            {figure_number || `Source ${sourceIndex + 1}`}
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
                {collectionId && paper.paper_id && (
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
              <p>Figure from your collection</p>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {/* Figure Image */}
          <div className="relative bg-gray-50 rounded-lg overflow-hidden border">
            {image_url && !imageError ? (
              <div className="relative min-h-[300px] max-h-[50vh]">
                <Image
                  src={image_url}
                  alt={figure_caption || figure_number || 'Figure'}
                  fill
                  className="object-contain p-4"
                  sizes="(max-width: 768px) 100vw, 900px"
                  onError={() => setImageError(true)}
                  priority
                />
              </div>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center text-gray-400">
                <FigureIcon className="h-16 w-16 mb-2" />
                <p className="text-sm">Image not available</p>
              </div>
            )}
          </div>

          {/* Caption */}
          {figure_caption && (
            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="text-xs font-medium text-gray-500 mb-1">Caption</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {figure_caption}
              </p>
            </div>
          )}

          {/* Description (from Vision AI analysis) */}
          {text && text !== figure_caption && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
              <p className="text-xs font-medium text-blue-600 mb-1">
                AI Analysis
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
            </div>
          )}

          {/* Metadata badges */}
          <div className="flex flex-wrap gap-2">
            {page_number && (
              <Badge variant="outline" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                Page {page_number}
              </Badge>
            )}
            <Badge
              variant="outline"
              className="text-xs text-emerald-600 border-emerald-200"
            >
              <FigureIcon className="h-3 w-3 mr-1" />
              {getFigureType(figure_number)}
            </Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * FigureSourceBadge is a compact badge for displaying figures in the sources list
 */
export function FigureSourceBadge({
  chunk,
  sourceIndex,
  onClick,
  isRelated,
}: {
  chunk: GroundingChunk;
  sourceIndex: number;
  onClick: () => void;
  isRelated?: boolean;
}) {
  const ctx = chunk.retrievedContext;
  if (!ctx) return null;

  const { figure_number } = ctx;
  const FigureIcon = getFigureIcon(figure_number);

  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors',
        isRelated
          ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
      )}
    >
      <FigureIcon className="h-3.5 w-3.5" />
      <span className="font-medium">
        {figure_number || `Figure ${sourceIndex + 1}`}
      </span>
      {isRelated && <span className="text-[10px] opacity-75">(related)</span>}
    </button>
  );
}
