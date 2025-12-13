'use client';

import { X, Loader2, FileText, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { PaperSearchResult } from '@/hooks/usePaperSearch';

const MAX_SEED_PAPERS = 10;

interface SeedPaperSelectionPanelProps {
  name: string;
  onNameChange: (name: string) => void;
  researchQuestion: string;
  onResearchQuestionChange: (question: string) => void;
  selectedPapers: PaperSearchResult[];
  onRemovePaper: (paperId: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  nameError?: string;
  researchQuestionError?: string;
  papersError?: string;
}

/**
 * Format authors for compact display
 */
function formatAuthors(authors: Array<{ name: string }>): string {
  if (!authors.length) return 'Unknown';
  if (authors.length === 1) return authors[0].name;
  return `${authors[0].name} et al.`;
}

/**
 * Right panel component for collection details and selected papers
 */
export function SeedPaperSelectionPanel({
  name,
  onNameChange,
  researchQuestion,
  onResearchQuestionChange,
  selectedPapers,
  onRemovePaper,
  onSubmit,
  isSubmitting,
  nameError,
  researchQuestionError,
  papersError,
}: SeedPaperSelectionPanelProps) {
  // Calculate summary stats
  const openAccessCount = selectedPapers.filter(p => p.isOpenAccess).length;
  const paywalledCount = selectedPapers.length - openAccessCount;

  // Check if form is valid
  const isValid =
    name.trim().length > 0 &&
    researchQuestion.trim().length >= 10 &&
    selectedPapers.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Collection Details */}
      <div className="space-y-4 border-b pb-4">
        {/* Collection Name */}
        <div className="space-y-1.5">
          <Label htmlFor="collection-name" className="text-sm font-medium">
            Collection Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="collection-name"
            placeholder="e.g., Quantum Computing Papers"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            disabled={isSubmitting}
            className={nameError ? 'border-destructive' : ''}
          />
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>

        {/* Research Question */}
        <div className="space-y-1.5">
          <Label htmlFor="research-question" className="text-sm font-medium">
            Research Question <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="research-question"
            placeholder="What do you want to learn about? (e.g., How do transformer architectures improve NLP tasks?)"
            value={researchQuestion}
            onChange={e => onResearchQuestionChange(e.target.value)}
            disabled={isSubmitting}
            rows={3}
            className={`resize-none ${researchQuestionError ? 'border-destructive' : ''}`}
          />
          <p className="text-xs text-muted-foreground">
            This helps prioritize related papers when expanding your collection
          </p>
          {researchQuestionError && (
            <p className="text-xs text-destructive">{researchQuestionError}</p>
          )}
        </div>
      </div>

      {/* Selected Papers Header */}
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Selected Papers</Label>
          <Badge
            variant={selectedPapers.length > 0 ? 'default' : 'secondary'}
            className="px-2 py-0"
          >
            {selectedPapers.length}/{MAX_SEED_PAPERS}
          </Badge>
        </div>
        {papersError && (
          <p className="text-xs text-destructive">{papersError}</p>
        )}
      </div>

      {/* Selected Papers List */}
      <div className="flex-1 space-y-2 overflow-y-auto pb-3">
        {selectedPapers.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              Search and add papers from the left panel
            </p>
          </div>
        ) : (
          selectedPapers.map(paper => (
            <div
              key={paper.paperId}
              className="group relative rounded-lg border bg-muted/30 p-3"
            >
              {/* Title */}
              <h4 className="mb-1 line-clamp-2 pr-8 text-sm font-medium leading-snug">
                {paper.title}
              </h4>

              {/* Meta */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatAuthors(paper.authors)}</span>
                {paper.year && (
                  <>
                    <span>&middot;</span>
                    <span>{paper.year}</span>
                  </>
                )}
                {paper.isOpenAccess ? (
                  <Badge
                    variant="secondary"
                    className="h-4 bg-green-100 px-1 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  >
                    <FileText className="mr-0.5 h-2.5 w-2.5" />
                    OA
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="h-4 bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  >
                    <Lock className="mr-0.5 h-2.5 w-2.5" />
                    Paywalled
                  </Badge>
                )}
              </div>

              {/* Remove button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onRemovePaper(paper.paperId)}
                disabled={isSubmitting}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Summary & Submit */}
      <div className="space-y-3 border-t pt-3">
        {/* Access summary */}
        {selectedPapers.length > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3 text-green-600" />
              {openAccessCount} Open Access (auto-indexed)
            </span>
            {paywalledCount > 0 && (
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3 text-amber-600" />
                {paywalledCount} Paywalled (manual upload needed)
              </span>
            )}
          </div>
        )}

        {/* Create button */}
        <Button
          className="w-full"
          onClick={onSubmit}
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Collection...
            </>
          ) : (
            'Create Collection'
          )}
        </Button>
      </div>
    </div>
  );
}
