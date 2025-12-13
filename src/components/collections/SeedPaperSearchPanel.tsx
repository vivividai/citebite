'use client';

import { useCallback, useRef, useEffect } from 'react';
import {
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  Filter,
  AlertCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { PaperSearchCard } from './PaperSearchCard';
import {
  usePaperSearch,
  type SearchType,
  type PaperSearchResult,
} from '@/hooks/usePaperSearch';
import { useState } from 'react';

const MAX_SEED_PAPERS = 10;

interface SeedPaperSearchPanelProps {
  selectedPapers: PaperSearchResult[];
  onAddPaper: (paper: PaperSearchResult) => void;
  onRemovePaper: (paperId: string) => void;
}

/**
 * Left panel component for searching and selecting seed papers
 */
export function SeedPaperSearchPanel({
  selectedPapers,
  onAddPaper,
  onRemovePaper,
}: SeedPaperSearchPanelProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    searchType,
    setSearchType,
    filters,
    updateFilters,
    results,
    total,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isError,
    error,
    hasMore,
    loadMore,
  } = usePaperSearch();

  // Check if a paper is selected
  const isPaperSelected = useCallback(
    (paperId: string) => selectedPapers.some(p => p.paperId === paperId),
    [selectedPapers]
  );

  // Check if max papers reached
  const isMaxReached = selectedPapers.length >= MAX_SEED_PAPERS;

  // Handle paper selection toggle
  const handleTogglePaper = useCallback(
    (paper: PaperSearchResult) => {
      if (isPaperSelected(paper.paperId)) {
        onRemovePaper(paper.paperId);
      } else if (!isMaxReached) {
        onAddPaper(paper);
      }
    },
    [isPaperSelected, isMaxReached, onAddPaper, onRemovePaper]
  );

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || isFetchingNextPage || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadMore();
    }
  }, [isFetchingNextPage, hasMore, loadMore]);

  // Attach scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Get placeholder text based on search type
  const getPlaceholder = () => {
    switch (searchType) {
      case 'title':
        return 'Enter paper title...';
      default:
        return 'Enter keywords...';
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search Header */}
      <div className="space-y-3 border-b pb-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Search Papers</Label>
          <span className="text-xs text-muted-foreground">
            {total > 0 && `${total.toLocaleString()} results`}
          </span>
        </div>

        {/* Search Type & Input */}
        <div className="flex gap-2">
          <Select
            value={searchType}
            onValueChange={(v: SearchType) => setSearchType(v)}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keywords">Keywords</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={getPlaceholder()}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Collapsible Filters */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-between px-2 text-xs"
            >
              <span className="flex items-center gap-1">
                <Filter className="h-3 w-3" />
                Filters
              </span>
              {filtersOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            {/* Year Range */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">From Year</Label>
                <Input
                  type="number"
                  placeholder="e.g., 2020"
                  value={filters.yearFrom || ''}
                  onChange={e =>
                    updateFilters({
                      yearFrom: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Year</Label>
                <Input
                  type="number"
                  placeholder="e.g., 2024"
                  value={filters.yearTo || ''}
                  onChange={e =>
                    updateFilters({
                      yearTo: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Min Citations */}
            <div className="space-y-1">
              <Label className="text-xs">Minimum Citations</Label>
              <Input
                type="number"
                placeholder="e.g., 10"
                value={filters.minCitations ?? ''}
                onChange={e =>
                  updateFilters({
                    minCitations: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                className="h-8 text-sm"
              />
            </div>

            {/* Open Access Only */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="openAccessOnly"
                checked={filters.openAccessOnly || false}
                onCheckedChange={checked =>
                  updateFilters({ openAccessOnly: checked === true })
                }
              />
              <label
                htmlFor="openAccessOnly"
                className="text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Open Access Only
              </label>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Results List */}
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3"
      >
        {/* Initial loading state */}
        {isLoading && !results.length && (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">
              {error?.message || 'Failed to search papers'}
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading &&
          !isError &&
          query.length >= 2 &&
          results.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No papers found. Try different keywords or adjust filters.
            </div>
          )}

        {/* Hint when no query */}
        {!isLoading && query.length < 2 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Enter at least 2 characters to search
          </div>
        )}

        {/* Paper results */}
        {results.map(paper => (
          <PaperSearchCard
            key={paper.paperId}
            paper={paper}
            isSelected={isPaperSelected(paper.paperId)}
            isDisabled={isMaxReached}
            onSelect={() => handleTogglePaper(paper)}
          />
        ))}

        {/* Loading more indicator */}
        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Load more button (fallback for scroll) */}
        {hasMore && !isFetchingNextPage && results.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={loadMore}
          >
            Load more results
          </Button>
        )}
      </div>

      {/* Fetching indicator (for background refetch) */}
      {isFetching && !isLoading && !isFetchingNextPage && (
        <div className="border-t py-2 text-center text-xs text-muted-foreground">
          Updating results...
        </div>
      )}
    </div>
  );
}
