'use client';

/**
 * Match Review List Component
 * Displays upload results with match confidence and manual correction options
 */

import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  UserCheck,
  FileText,
  ChevronDown,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { BulkUploadResult } from '@/hooks/useBulkUpload';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Paper {
  paperId: string;
  title: string;
}

interface MatchReviewListProps {
  results: BulkUploadResult[];
  unmatchedPapers: Paper[];
  matchOverrides: Record<string, string>;
  onMatchChange: (fileId: string, paperId: string) => void;
}

// Confidence badge component
function ConfidenceBadge({
  confidence,
  isManual,
}: {
  confidence: 'high' | 'medium' | 'none';
  isManual?: boolean;
}) {
  if (isManual) {
    return (
      <Badge
        variant="outline"
        className="bg-blue-50 text-blue-700 border-blue-200"
      >
        <UserCheck className="h-3 w-3 mr-1" />
        MANUAL
      </Badge>
    );
  }

  if (confidence === 'high') {
    return (
      <Badge
        variant="outline"
        className="bg-green-50 text-green-700 border-green-200"
      >
        <CheckCircle className="h-3 w-3 mr-1" />
        HIGH
      </Badge>
    );
  }

  if (confidence === 'medium') {
    return (
      <Badge
        variant="outline"
        className="bg-amber-50 text-amber-700 border-amber-200"
      >
        <AlertTriangle className="h-3 w-3 mr-1" />
        MEDIUM
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
      <XCircle className="h-3 w-3 mr-1" />
      NO MATCH
    </Badge>
  );
}

// Single match item component
function MatchReviewItem({
  result,
  unmatchedPapers,
  override,
  onMatchChange,
}: {
  result: BulkUploadResult;
  unmatchedPapers: Paper[];
  override: string | undefined;
  onMatchChange: (paperId: string) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const isManual = override !== undefined;
  const currentPaperId = override || result.match.paperId;
  const currentPaperTitle =
    override !== undefined
      ? unmatchedPapers.find(p => p.paperId === override)?.title ||
        result.match.paperTitle
      : result.match.paperTitle;

  // Build list of available papers for selection
  const availablePapers = [
    // Current match if exists
    ...(result.match.paperId
      ? [
          {
            paperId: result.match.paperId,
            title: result.match.paperTitle || '',
          },
        ]
      : []),
    // Unmatched papers
    ...unmatchedPapers.filter(p => p.paperId !== result.match.paperId),
  ];

  return (
    <div
      className={cn(
        'border rounded-lg p-4 space-y-3',
        result.match.confidence === 'none' &&
          !override &&
          'border-red-200 bg-red-50/50',
        result.match.confidence === 'medium' &&
          !override &&
          'border-amber-200 bg-amber-50/50',
        isManual && 'border-blue-200 bg-blue-50/50'
      )}
    >
      {/* File Info */}
      <div className="flex items-start gap-3">
        <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{result.filename}</p>
          {result.extractedMetadata?.doi && (
            <p className="text-xs text-muted-foreground">
              DOI: {result.extractedMetadata.doi}
            </p>
          )}
          {result.extractedMetadata?.arxivId && (
            <p className="text-xs text-muted-foreground">
              arXiv: {result.extractedMetadata.arxivId}
            </p>
          )}
          {result.extractedMetadata?.title &&
            result.extractedMetadata?.extractionMethod === 'title' && (
              <p className="text-xs text-muted-foreground truncate">
                Extracted title: {result.extractedMetadata.title}
              </p>
            )}
        </div>
        <ConfidenceBadge
          confidence={result.match.confidence}
          isManual={isManual}
        />
      </div>

      {/* Match Result */}
      <div className="pl-8 space-y-2">
        {currentPaperId ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Matched to:</span>
            <span className="text-sm font-medium truncate">
              {currentPaperTitle}
            </span>
          </div>
        ) : (
          <p className="text-sm text-red-600">No automatic match found</p>
        )}

        {/* Paper Selection */}
        <Select value={currentPaperId || ''} onValueChange={onMatchChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a paper..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">-- Skip this file --</SelectItem>
            {availablePapers.map(paper => (
              <SelectItem key={paper.paperId} value={paper.paperId}>
                <span className="truncate">{paper.title}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Show extraction details */}
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <ChevronDown
                className={cn(
                  'h-3 w-3 mr-1 transition-transform',
                  showDetails && 'rotate-180'
                )}
              />
              {showDetails ? 'Hide details' : 'Show details'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted/50 rounded">
              {result.extractedMetadata?.extractionMethod && (
                <p>
                  <strong>Method:</strong>{' '}
                  {result.extractedMetadata.extractionMethod}
                </p>
              )}
              {result.match.score && (
                <p>
                  <strong>Score:</strong>{' '}
                  {(result.match.score * 100).toFixed(1)}%
                </p>
              )}
              {result.extractedMetadata?.title && (
                <p className="truncate">
                  <strong>Extracted:</strong> {result.extractedMetadata.title}
                </p>
              )}
              {!result.extractedMetadata && (
                <p>
                  <strong>Match Method:</strong> {result.match.matchMethod}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

export function MatchReviewList({
  results,
  unmatchedPapers,
  matchOverrides,
  onMatchChange,
}: MatchReviewListProps) {
  // Sort results: no match first, then medium, then high
  const sortedResults = [...results].sort((a, b) => {
    const order = { none: 0, medium: 1, high: 2 };
    return order[a.match.confidence] - order[b.match.confidence];
  });

  return (
    <div className="space-y-4 max-h-[50vh] overflow-y-auto">
      {sortedResults.map(result => (
        <MatchReviewItem
          key={result.fileId}
          result={result}
          unmatchedPapers={unmatchedPapers}
          override={matchOverrides[result.fileId]}
          onMatchChange={paperId => {
            if (paperId === '_none') {
              // Handle skip case - could remove from overrides or set to empty
              onMatchChange(result.fileId, '');
            } else {
              onMatchChange(result.fileId, paperId);
            }
          }}
        />
      ))}

      {/* Papers still needing PDFs */}
      {unmatchedPapers.length > 0 && (
        <div className="mt-6 pt-4 border-t">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between"
              >
                <span className="text-sm text-muted-foreground">
                  {unmatchedPapers.length} papers still need PDFs
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {unmatchedPapers.map(paper => (
                  <div
                    key={paper.paperId}
                    className="text-sm text-muted-foreground truncate px-2"
                  >
                    {paper.title}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
