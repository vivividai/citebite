'use client';

import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCollectionPapers, Paper } from '@/hooks/useCollectionPapers';
import { useBatchRemovePapers } from '@/hooks/useBatchRemovePapers';
import { PaperCard } from './PaperCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2,
  FileText,
  AlertCircle,
  ArrowUpDown,
  Upload,
  Pencil,
  X,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { BulkUploadDialog } from '@/components/papers/BulkUploadDialog';
import { ExpandCollectionDialog } from './ExpandCollectionDialog';
import { calculateOverallStatus } from '@/lib/utils/status';

interface PaperListProps {
  collectionId: string;
}

type FilterType = 'all' | 'indexed' | 'failed' | 'pending';
type SortType = 'citations' | 'year' | 'relevance';

export function PaperList({ collectionId }: PaperListProps) {
  const { data: papers, isLoading, error } = useCollectionPapers(collectionId);
  const batchRemove = useBatchRemovePapers();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterType>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortType>('citations');
  const [yearFrom, setYearFrom] = useState<string>('');
  const [yearTo, setYearTo] = useState<string>('');

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(
    new Set()
  );
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  // Expand dialog state
  const [expandDialogOpen, setExpandDialogOpen] = useState(false);
  const [expandPaperId, setExpandPaperId] = useState<string | null>(null);
  const [expandPaperTitle, setExpandPaperTitle] = useState<string>('');
  const [expandPaperDegree, setExpandPaperDegree] = useState<number>(0);

  // All hooks must be called before any conditional returns
  // Filter and sort papers
  const filteredAndSortedPapers = useMemo(() => {
    if (!papers || papers.length === 0) return [];

    // First, filter by status
    let result = papers.filter((paper: Paper) => {
      const overallStatus = calculateOverallStatus(
        paper.text_vector_status,
        paper.image_vector_status
      );
      if (filter === 'indexed') return overallStatus === 'completed';
      if (filter === 'failed') return overallStatus === 'failed';
      if (filter === 'pending')
        return overallStatus === 'pending' || overallStatus === 'processing';
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
      indexed: papers.filter((p: Paper) => {
        const status = calculateOverallStatus(
          p.text_vector_status,
          p.image_vector_status
        );
        return status === 'completed';
      }).length,
      failed: papers.filter((p: Paper) => {
        const status = calculateOverallStatus(
          p.text_vector_status,
          p.image_vector_status
        );
        return status === 'failed';
      }).length,
      pending: papers.filter((p: Paper) => {
        const status = calculateOverallStatus(
          p.text_vector_status,
          p.image_vector_status
        );
        return status === 'pending' || status === 'processing';
      }).length,
    };
  }, [papers]);

  // Selection handlers
  const handleToggleSelectionMode = () => {
    if (selectionMode) {
      // Exiting selection mode - clear selections
      setSelectedPaperIds(new Set());
    }
    setSelectionMode(!selectionMode);
  };

  const handleSelectPaper = (paperId: string) => {
    setSelectedPaperIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paperId)) {
        newSet.delete(paperId);
      } else {
        newSet.add(paperId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const allVisibleIds = filteredAndSortedPapers.map(p => p.paper_id);
    const allSelected = allVisibleIds.every(id => selectedPaperIds.has(id));

    if (allSelected) {
      // Deselect all visible papers
      setSelectedPaperIds(prev => {
        const newSet = new Set(prev);
        allVisibleIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Select all visible papers
      setSelectedPaperIds(prev => {
        const newSet = new Set(prev);
        allVisibleIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };

  const handleBatchDelete = () => {
    const paperIds = Array.from(selectedPaperIds);
    batchRemove.mutate(
      { collectionId, paperIds },
      {
        onSuccess: () => {
          setBatchDeleteDialogOpen(false);
          setSelectedPaperIds(new Set());
          setSelectionMode(false);
        },
      }
    );
  };

  const allVisibleSelected =
    filteredAndSortedPapers.length > 0 &&
    filteredAndSortedPapers.every(p => selectedPaperIds.has(p.paper_id));

  // Handle expand button click
  const handleExpand = (
    paperId: string,
    paperTitle: string,
    degree: number
  ) => {
    setExpandPaperId(paperId);
    setExpandPaperTitle(paperTitle);
    setExpandPaperDegree(degree);
    setExpandDialogOpen(true);
  };

  // Handle refresh button click
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({
      queryKey: ['collections', collectionId, 'papers'],
    });
    setIsRefreshing(false);
  };

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

          {/* Bulk Upload Button - shown when papers need PDFs */}
          {counts.failed > 0 && (
            <BulkUploadDialog
              collectionId={collectionId}
              papersNeedingPdf={papers
                .filter((p: Paper) => p.text_vector_status === 'failed')
                .map((p: Paper) => ({ paper_id: p.paper_id, title: p.title }))}
              trigger={
                <Button variant="secondary" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Upload PDFs
                </Button>
              }
            />
          )}

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="ml-auto"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>

          {/* Edit/Selection Mode Toggle */}
          <Button
            variant={selectionMode ? 'secondary' : 'outline'}
            size="sm"
            onClick={handleToggleSelectionMode}
          >
            {selectionMode ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </>
            )}
          </Button>
        </div>

        {/* Selection Mode Controls */}
        {selectionMode && (
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={handleSelectAll}
                id="select-all"
              />
              <label
                htmlFor="select-all"
                className="text-sm font-medium cursor-pointer"
              >
                Select all
              </label>
            </div>
            <span className="text-sm text-muted-foreground">
              {selectedPaperIds.size} selected
            </span>
            {selectedPaperIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBatchDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove Selected
              </Button>
            )}
          </div>
        )}

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
            <PaperCard
              key={paper.paper_id}
              paper={paper}
              collectionId={collectionId}
              selectionMode={selectionMode}
              isSelected={selectedPaperIds.has(paper.paper_id)}
              onSelect={handleSelectPaper}
              onExpand={handleExpand}
            />
          ))}
        </div>
      )}

      {/* Batch Delete Confirmation Dialog */}
      <AlertDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {selectedPaperIds.size} papers?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will remove the selected papers from this collection.
                </p>
                <p className="text-sm">
                  For each paper, the following will be deleted:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>Vector embeddings (search index)</li>
                  <li>PDF file from storage</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchRemove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              disabled={batchRemove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {batchRemove.isPending
                ? 'Removing...'
                : `Remove ${selectedPaperIds.size} papers`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Expand Collection Dialog */}
      {expandPaperId && (
        <ExpandCollectionDialog
          open={expandDialogOpen}
          onOpenChange={setExpandDialogOpen}
          collectionId={collectionId}
          paperId={expandPaperId}
          paperTitle={expandPaperTitle}
          sourceDegree={expandPaperDegree}
        />
      )}
    </div>
  );
}
