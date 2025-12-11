'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { PaperPreviewCard } from './PaperPreviewCard';
import { Loader2, Lock, Unlock, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PaperPreview } from '@/lib/search/types';

interface PreviewStats {
  totalPapers: number;
  openAccessPapers: number;
  paywalledPapers: number;
  papersWithEmbeddings: number;
  rerankingApplied: boolean;
}

interface PaperPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  papers: PaperPreview[];
  stats: PreviewStats;
  searchQuery: string;
  isCreating: boolean;
  onConfirm: (selectedPaperIds: string[]) => void;
  onCancel: () => void;
  /** Custom button text for confirm button (default: "컬렉션 생성 (N개)") */
  confirmButtonText?: string;
}

/**
 * Dialog for previewing papers with similarity scores and selection
 */
export function PaperPreviewDialog({
  open,
  onOpenChange,
  papers,
  stats,
  searchQuery,
  isCreating,
  onConfirm,
  onCancel,
  confirmButtonText,
}: PaperPreviewDialogProps) {
  // Threshold state (0-100)
  const [threshold, setThreshold] = useState(50);
  // Selected paper IDs
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(
    new Set()
  );

  // Check if any papers have embeddings (for showing/hiding threshold slider)
  const hasEmbeddings = papers.some(p => p.hasEmbedding);

  // Calculate papers above threshold
  const papersAboveThreshold = useMemo(() => {
    if (!hasEmbeddings) return papers;
    return papers.filter(p => {
      if (p.similarity === null) return true; // Papers without embedding are included by default
      return p.similarity * 100 >= threshold;
    });
  }, [papers, threshold, hasEmbeddings]);

  // Initialize selection when papers change or threshold changes
  useEffect(() => {
    if (papers.length === 0) return;

    // Select papers above threshold by default
    const initialSelected = new Set(papersAboveThreshold.map(p => p.paperId));
    setSelectedPaperIds(initialSelected);
  }, [papers, threshold, papersAboveThreshold]);

  // Toggle individual paper selection
  const handleTogglePaper = (paperId: string) => {
    setSelectedPaperIds(prev => {
      const next = new Set(prev);
      if (next.has(paperId)) {
        next.delete(paperId);
      } else {
        next.add(paperId);
      }
      return next;
    });
  };

  // Select all papers
  const handleSelectAll = () => {
    setSelectedPaperIds(new Set(papers.map(p => p.paperId)));
  };

  // Clear all selection
  const handleClearSelection = () => {
    setSelectedPaperIds(new Set());
  };

  // Calculate selected paper stats
  const selectedPapers = papers.filter(p => selectedPaperIds.has(p.paperId));
  const selectedOpenAccess = selectedPapers.filter(p => p.isOpenAccess).length;
  const selectedPaywalled = selectedPapers.length - selectedOpenAccess;

  // Handle confirm
  const handleConfirm = () => {
    onConfirm(Array.from(selectedPaperIds));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>논문 프리뷰</DialogTitle>
          <DialogDescription>
            &quot;{searchQuery}&quot; 검색 결과: {stats.totalPapers}개 논문
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4 overflow-hidden">
          {/* Threshold Slider (only show if papers have embeddings) */}
          {hasEmbeddings && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="font-medium">최소 유사도</Label>
                <span className="text-sm font-medium tabular-nums">
                  {threshold}%
                </span>
              </div>
              <Slider
                value={[threshold]}
                onValueChange={([value]) => setThreshold(value)}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
              {/* Preset buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={threshold === 50 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setThreshold(50)}
                >
                  50%
                </Button>
                <Button
                  type="button"
                  variant={threshold === 70 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setThreshold(70)}
                >
                  70%
                </Button>
                <Button
                  type="button"
                  variant={threshold === 85 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setThreshold(85)}
                >
                  85%
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                임계값 이하 논문도 개별 선택 가능합니다
              </p>
            </div>
          )}

          {/* Selection controls */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              <strong>{selectedPaperIds.size}</strong>개 선택됨 /{' '}
              {stats.totalPapers}개 중
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                전체 선택
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearSelection}
              >
                전체 해제
              </Button>
            </div>
          </div>

          {/* Paper list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 max-h-[350px]">
            {papers.map(paper => (
              <PaperPreviewCard
                key={paper.paperId}
                paper={paper}
                isSelected={selectedPaperIds.has(paper.paperId)}
                onToggle={handleTogglePaper}
                isAboveThreshold={
                  !hasEmbeddings ||
                  paper.similarity === null ||
                  paper.similarity * 100 >= threshold
                }
              />
            ))}
          </div>

          {/* Summary panel */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span>
                <strong>{selectedPaperIds.size}</strong>개 논문 선택
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Unlock className="h-4 w-4 text-green-600" />
              <span>
                <strong>{selectedOpenAccess}</strong>개 Open Access (자동
                다운로드)
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-amber-600" />
              <span>
                <strong>{selectedPaywalled}</strong>개 Paywalled (수동 업로드
                필요)
              </span>
            </div>

            {/* Warning for too few papers */}
            {selectedPaperIds.size > 0 && selectedPaperIds.size < 5 && (
              <div
                className={cn(
                  'flex items-center gap-2 text-sm text-amber-600 pt-2 border-t'
                )}
              >
                <AlertCircle className="h-4 w-4" />
                <span>더 많은 논문을 선택하면 AI 대화 품질이 향상됩니다</span>
              </div>
            )}

            {/* Error for no papers */}
            {selectedPaperIds.size === 0 && (
              <div
                className={cn(
                  'flex items-center gap-2 text-sm text-destructive pt-2 border-t'
                )}
              >
                <AlertCircle className="h-4 w-4" />
                <span>컬렉션을 생성하려면 최소 1개의 논문을 선택하세요</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isCreating}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isCreating || selectedPaperIds.size === 0}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                처리 중...
              </>
            ) : (
              confirmButtonText || `컬렉션 생성 (${selectedPaperIds.size}개)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
