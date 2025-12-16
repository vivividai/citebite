'use client';

import { useQuery } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

interface CollectionProgressProps {
  collectionId: string;
  totalPapers: number;
  indexedPapers: number;
}

interface CollectionStatus {
  totalPapers: number;
  indexedPapers: number;
  failedPapers: number;
  downloadingPapers: number;
  processingPapers: number;
  allProcessed: boolean;
}

export function CollectionProgress({
  collectionId,
  totalPapers: initialTotal,
  indexedPapers: initialIndexed,
}: CollectionProgressProps) {
  // Poll the collection status
  const { data: status } = useQuery({
    queryKey: ['collection-status', collectionId],
    queryFn: async (): Promise<CollectionStatus> => {
      const res = await fetch(`/api/collections/${collectionId}/status`);
      if (!res.ok) {
        throw new Error('Failed to fetch status');
      }
      const data = await res.json();
      return data.data;
    },
    refetchInterval: query => {
      // Stop polling if all processed
      return query.state.data?.allProcessed ? false : 3000; // 3 seconds
    },
    initialData: {
      totalPapers: initialTotal,
      indexedPapers: initialIndexed,
      failedPapers: 0,
      downloadingPapers: 0,
      processingPapers: 0,
      allProcessed: initialIndexed >= initialTotal,
    },
  });

  const {
    totalPapers,
    indexedPapers,
    failedPapers,
    downloadingPapers,
    processingPapers,
  } = status;

  const progressPercentage =
    totalPapers > 0 ? Math.round((indexedPapers / totalPapers) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="text-muted-foreground">
            {downloadingPapers > 0
              ? `Downloading PDFs... (${downloadingPapers} pending)`
              : processingPapers > 0
                ? `Indexing papers... (${processingPapers} processing)`
                : `Processing papers... (${indexedPapers}/${totalPapers} complete)`}
          </span>
        </div>
        <span className="text-muted-foreground font-medium">
          {progressPercentage}%
        </span>
      </div>
      <Progress value={progressPercentage} className="h-2" />
      {failedPapers > 0 && (
        <p className="text-xs text-destructive">
          {failedPapers} paper{failedPapers !== 1 ? 's' : ''} failed
        </p>
      )}
    </div>
  );
}
