'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

interface SimilarityProgressProps {
  /** Similarity score (0-1) or null if no embedding */
  similarity: number | null;
  /** Show percentage text */
  showPercentage?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Get color class based on similarity score
 * - Green (80%+): High relevance
 * - Yellow (60-79%): Medium relevance
 * - Red (<60%): Low relevance
 */
function getSimilarityColor(similarity: number): string {
  if (similarity >= 0.8) return 'bg-green-500';
  if (similarity >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Similarity progress bar with color coding
 */
export function SimilarityProgress({
  similarity,
  showPercentage = true,
  className,
}: SimilarityProgressProps) {
  // Handle null similarity (no embedding)
  if (similarity === null) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[10px] text-muted-foreground">N/A</span>
          </div>
        </div>
        {showPercentage && (
          <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
            N/A
          </span>
        )}
      </div>
    );
  }

  const percentage = Math.round(similarity * 100);
  const colorClass = getSimilarityColor(similarity);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <ProgressPrimitive.Root
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted"
        value={percentage}
      >
        <ProgressPrimitive.Indicator
          className={cn('h-full w-full flex-1 transition-all', colorClass)}
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressPrimitive.Root>
      {showPercentage && (
        <span
          className={cn(
            'w-12 text-right text-sm font-medium tabular-nums',
            similarity >= 0.8 && 'text-green-600',
            similarity >= 0.6 && similarity < 0.8 && 'text-yellow-600',
            similarity < 0.6 && 'text-red-600'
          )}
        >
          {percentage}%
        </span>
      )}
    </div>
  );
}
