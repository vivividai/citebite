'use client';

import { memo } from 'react';
import { Plus, Check, FileText, Users, Calendar, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PaperSearchResult } from '@/hooks/usePaperSearch';

interface PaperSearchCardProps {
  paper: PaperSearchResult;
  isSelected: boolean;
  isDisabled: boolean;
  onSelect: () => void;
}

/**
 * Format authors list for display
 */
function formatAuthors(authors: Array<{ name: string }>): string {
  if (!authors.length) return 'Unknown authors';
  if (authors.length <= 3) {
    return authors.map(a => a.name).join(', ');
  }
  return `${authors
    .slice(0, 3)
    .map(a => a.name)
    .join(', ')} et al.`;
}

/**
 * Format citation count for display
 */
function formatCitations(count: number | null): string {
  if (count === null || count === undefined) return '-';
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

/**
 * Compact card component for displaying paper search results
 * Memoized to prevent unnecessary re-renders when parent state changes
 */
export const PaperSearchCard = memo(function PaperSearchCard({
  paper,
  isSelected,
  isDisabled,
  onSelect,
}: PaperSearchCardProps) {
  return (
    <div
      className={cn(
        'group relative rounded-lg border p-3 transition-colors',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'
      )}
    >
      {/* Title (2 lines max) */}
      <h4 className="mb-1 line-clamp-2 pr-10 text-sm font-medium leading-snug">
        {paper.title}
      </h4>

      {/* Authors */}
      <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="h-3 w-3 flex-shrink-0" />
        <span className="line-clamp-1">{formatAuthors(paper.authors)}</span>
      </p>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {/* Year */}
        {paper.year && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {paper.year}
          </span>
        )}

        {/* Venue */}
        {paper.venue && (
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span className="line-clamp-1 max-w-[120px]">{paper.venue}</span>
          </span>
        )}

        {/* Citations */}
        <span className="flex items-center gap-1">
          <Quote className="h-3 w-3" />
          {formatCitations(paper.citationCount)}
        </span>

        {/* Open Access Badge */}
        {paper.isOpenAccess && (
          <Badge
            variant="secondary"
            className="h-5 bg-green-100 px-1.5 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400"
          >
            Open Access
          </Badge>
        )}
      </div>

      {/* Add/Selected button */}
      <Button
        variant={isSelected ? 'default' : 'outline'}
        size="icon"
        className={cn(
          'absolute right-2 top-2 h-7 w-7',
          isSelected && 'bg-primary text-primary-foreground'
        )}
        onClick={e => {
          e.stopPropagation();
          onSelect();
        }}
        disabled={isDisabled && !isSelected}
      >
        {isSelected ? (
          <Check className="h-4 w-4" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
});
