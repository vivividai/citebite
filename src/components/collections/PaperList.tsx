'use client';

import { useState, useMemo } from 'react';
import { useCollectionPapers, Paper } from '@/hooks/useCollectionPapers';
import { PaperCard } from './PaperCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, FileText, AlertCircle, ArrowUpDown } from 'lucide-react';

interface PaperListProps {
  collectionId: string;
}

type FilterType = 'all' | 'indexed' | 'failed' | 'pending';
type SortType = 'citations' | 'year' | 'relevance';

export function PaperList({ collectionId }: PaperListProps) {
  const { data: papers, isLoading, error } = useCollectionPapers(collectionId);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('citations');
  const [yearFrom, setYearFrom] = useState<string>('');
  const [yearTo, setYearTo] = useState<string>('');

  // All hooks must be called before any conditional returns
  // Filter and sort papers
  const filteredAndSortedPapers = useMemo(() => {
    if (!papers || papers.length === 0) return [];

    // First, filter by status
    let result = papers.filter((paper: Paper) => {
      if (filter === 'indexed') return paper.vector_status === 'completed';
      if (filter === 'failed') return paper.vector_status === 'failed';
      if (filter === 'pending')
        return paper.vector_status === 'pending' || !paper.vector_status;
      return true; // 'all'
    });

    // Then, filter by year range
    if (yearFrom) {
      const fromYear = parseInt(yearFrom, 10);
      if (!isNaN(fromYear)) {
        result = result.filter(paper => paper.year && paper.year >= fromYear);
      }
    }
    if (yearTo) {
      const toYear = parseInt(yearTo, 10);
      if (!isNaN(toYear)) {
        result = result.filter(paper => paper.year && paper.year <= toYear);
      }
    }

    // Finally, sort
    const sorted = [...result];
    if (sortBy === 'citations') {
      sorted.sort((a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0));
    } else if (sortBy === 'year') {
      sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    }
    // 'relevance' keeps the original order from API

    return sorted;
  }, [papers, filter, yearFrom, yearTo, sortBy]);

  const counts = useMemo(() => {
    if (!papers) return { all: 0, indexed: 0, failed: 0, pending: 0 };
    return {
      all: papers.length,
      indexed: papers.filter((p: Paper) => p.vector_status === 'completed')
        .length,
      failed: papers.filter((p: Paper) => p.vector_status === 'failed').length,
      pending: papers.filter(
        (p: Paper) => p.vector_status === 'pending' || !p.vector_status
      ).length,
    };
  }, [papers]);

  // Now conditional returns are safe
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

  return (
    <div className="space-y-6">
      {/* Filters and Controls */}
      <div className="space-y-4">
        {/* Status Filter Buttons */}
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

        {/* Year Range and Sort Controls */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Year Range Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Year:</span>
            <Input
              type="number"
              placeholder="From"
              value={yearFrom}
              onChange={e => setYearFrom(e.target.value)}
              className="w-24 h-9"
              min="1900"
              max="2100"
            />
            <span className="text-sm text-muted-foreground">-</span>
            <Input
              type="number"
              placeholder="To"
              value={yearTo}
              onChange={e => setYearTo(e.target.value)}
              className="w-24 h-9"
              min="1900"
              max="2100"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select
              value={sortBy}
              onValueChange={value => setSortBy(value as SortType)}
            >
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="citations">Citations</SelectItem>
                <SelectItem value="year">Year</SelectItem>
                <SelectItem value="relevance">Relevance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results Count */}
          <div className="ml-auto text-sm text-muted-foreground">
            {filteredAndSortedPapers.length} paper
            {filteredAndSortedPapers.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Paper Grid */}
      {filteredAndSortedPapers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No papers match the selected filters.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredAndSortedPapers.map((paper: Paper) => (
            <PaperCard key={paper.paper_id} paper={paper} />
          ))}
        </div>
      )}
    </div>
  );
}
