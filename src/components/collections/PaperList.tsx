'use client';

import { useState } from 'react';
import { useCollectionPapers, Paper } from '@/hooks/useCollectionPapers';
import { PaperCard } from './PaperCard';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, AlertCircle } from 'lucide-react';

interface PaperListProps {
  collectionId: string;
}

type FilterType = 'all' | 'indexed' | 'failed' | 'pending';

export function PaperList({ collectionId }: PaperListProps) {
  const { data: papers, isLoading, error } = useCollectionPapers(collectionId);
  const [filter, setFilter] = useState<FilterType>('all');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h3 className="text-lg font-semibold">Failed to load papers</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </p>
        </div>
      </div>
    );
  }

  if (!papers || papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <h3 className="text-lg font-semibold">No papers found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This collection doesn&apos;t have any papers yet.
          </p>
        </div>
      </div>
    );
  }

  // Filter papers based on selected filter
  const filteredPapers = papers.filter((paper: Paper) => {
    if (filter === 'indexed') return paper.vector_status === 'completed';
    if (filter === 'failed') return paper.vector_status === 'failed';
    if (filter === 'pending')
      return paper.vector_status === 'pending' || !paper.vector_status;
    return true; // 'all'
  });

  const counts = {
    all: papers.length,
    indexed: papers.filter((p: Paper) => p.vector_status === 'completed')
      .length,
    failed: papers.filter((p: Paper) => p.vector_status === 'failed').length,
    pending: papers.filter(
      (p: Paper) => p.vector_status === 'pending' || !p.vector_status
    ).length,
  };

  return (
    <div className="space-y-6">
      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({counts.all})
        </Button>
        <Button
          variant={filter === 'indexed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('indexed')}
        >
          Indexed ({counts.indexed})
        </Button>
        <Button
          variant={filter === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('pending')}
        >
          Pending ({counts.pending})
        </Button>
        {counts.failed > 0 && (
          <Button
            variant={filter === 'failed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('failed')}
          >
            Failed ({counts.failed})
          </Button>
        )}
      </div>

      {/* Paper grid */}
      {filteredPapers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No papers match the selected filter.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredPapers.map((paper: Paper) => (
            <PaperCard key={paper.paper_id} paper={paper} />
          ))}
        </div>
      )}
    </div>
  );
}
