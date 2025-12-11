'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { SimilarityProgress } from './SimilarityProgress';
import { cn } from '@/lib/utils';
import type { PaperPreview } from '@/lib/search/types';
import { Quote, Unlock } from 'lucide-react';

interface PaperPreviewCardProps {
  paper: PaperPreview;
  isSelected: boolean;
  onToggle: (paperId: string) => void;
  /** Whether paper is above the current threshold */
  isAboveThreshold: boolean;
}

/**
 * Compact paper card for preview dialog with checkbox and similarity score
 */
export function PaperPreviewCard({
  paper,
  isSelected,
  onToggle,
  isAboveThreshold,
}: PaperPreviewCardProps) {
  const authorText =
    paper.authors.length > 0
      ? paper.authors.length > 2
        ? `${paper.authors[0].name} et al.`
        : paper.authors.map(a => a.name).join(', ')
      : 'Unknown';

  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border p-3 transition-all',
        isAboveThreshold ? 'bg-background' : 'bg-muted/30 opacity-60',
        isSelected && 'ring-2 ring-primary ring-offset-1'
      )}
    >
      {/* Checkbox */}
      <div className="flex items-start pt-0.5">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggle(paper.paperId)}
          aria-label={`Select paper: ${paper.title}`}
        />
      </div>

      {/* Paper info */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Title */}
        <h4
          className="line-clamp-2 text-sm font-medium leading-tight"
          title={paper.title}
        >
          {paper.title}
        </h4>

        {/* Authors, Year, Venue */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{authorText}</span>
          {paper.year && (
            <>
              <span>·</span>
              <span>{paper.year}</span>
            </>
          )}
          {paper.venue && (
            <>
              <span>·</span>
              <span className="truncate max-w-[150px]" title={paper.venue}>
                {paper.venue}
              </span>
            </>
          )}
        </div>

        {/* Similarity progress bar */}
        <SimilarityProgress
          similarity={paper.similarity}
          className="max-w-xs"
        />

        {/* Footer: Citations, Open Access badge, Degree badge */}
        <div className="flex items-center gap-3 pt-0.5">
          {paper.citationCount !== null && paper.citationCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Quote className="h-3 w-3" />
              <span>{paper.citationCount.toLocaleString()}</span>
            </div>
          )}
          {paper.isOpenAccess && (
            <Badge
              variant="secondary"
              className="h-5 gap-1 px-1.5 text-[10px] font-normal"
            >
              <Unlock className="h-2.5 w-2.5" />
              Open Access
            </Badge>
          )}
          {paper.degree && (
            <Badge
              variant="outline"
              className={cn(
                'h-5 px-1.5 text-[10px] font-normal',
                paper.degree === 1 && 'border-green-500 text-green-600',
                paper.degree === 2 && 'border-blue-500 text-blue-600',
                paper.degree === 3 && 'border-purple-500 text-purple-600'
              )}
            >
              Degree {paper.degree}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
