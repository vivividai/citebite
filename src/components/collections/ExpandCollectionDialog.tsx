'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useExpandPreview } from '@/hooks/useExpandPreview';
import { useExpandCollection } from '@/hooks/useExpandCollection';
import { PaperPreviewDialog } from './PaperPreviewDialog';

interface ExpandCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  paperId: string;
  paperTitle: string;
}

type ExpandType = 'references' | 'citations' | 'both';

/**
 * Dialog for expanding collection via references/citations
 */
export function ExpandCollectionDialog({
  open,
  onOpenChange,
  collectionId,
  paperId,
  paperTitle,
}: ExpandCollectionDialogProps) {
  // Options state
  const [expandType, setExpandType] = useState<ExpandType>('both');
  const [influentialOnly, setInfluentialOnly] = useState(false);
  const [maxPapers, setMaxPapers] = useState(100);

  // Preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    papers: Parameters<typeof PaperPreviewDialog>[0]['papers'];
    stats: Parameters<typeof PaperPreviewDialog>[0]['stats'];
    searchQuery: string;
  } | null>(null);

  const expandPreview = useExpandPreview();
  const expandCollection = useExpandCollection();

  const handlePreview = async () => {
    try {
      const result = await expandPreview.mutateAsync({
        collectionId,
        paperId,
        type: expandType,
        influentialOnly,
        maxPapers,
      });

      // Transform stats to match PaperPreviewDialog's expected format
      const transformedStats = {
        totalPapers: result.data.papers.length,
        openAccessPapers: result.data.papers.filter(p => p.isOpenAccess).length,
        paywalledPapers: result.data.papers.filter(p => !p.isOpenAccess).length,
        papersWithEmbeddings: result.data.stats.papersWithEmbeddings,
        rerankingApplied: result.data.stats.rerankingApplied,
      };

      setPreviewData({
        papers: result.data.papers,
        stats: transformedStats,
        searchQuery: result.data.sourceQuery,
      });
      setPreviewOpen(true);
    } catch {
      // Error is handled by the mutation
    }
  };

  const handleConfirm = (selectedPaperIds: string[]) => {
    expandCollection.mutate(
      {
        collectionId,
        selectedPaperIds,
      },
      {
        onSuccess: () => {
          setPreviewOpen(false);
          setPreviewData(null);
          onOpenChange(false);
        },
      }
    );
  };

  const handleCancel = () => {
    setPreviewOpen(false);
  };

  const handleClose = () => {
    if (!expandPreview.isPending && !expandCollection.isPending) {
      setPreviewData(null);
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Expand Collection</DialogTitle>
            <DialogDescription className="line-clamp-2">
              Find related papers from &quot;{paperTitle}&quot;
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Expand Type Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Find papers from:</Label>
              <Select
                value={expandType}
                onValueChange={(value: ExpandType) => setExpandType(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select source..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="references">
                    References (papers this paper cites)
                  </SelectItem>
                  <SelectItem value="citations">
                    Citations (papers citing this paper)
                  </SelectItem>
                  <SelectItem value="both">
                    Both references and citations
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Influential Only Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="influential"
                checked={influentialOnly}
                onCheckedChange={(checked: boolean) =>
                  setInfluentialOnly(checked)
                }
              />
              <Label htmlFor="influential" className="font-normal">
                Influential citations only
              </Label>
            </div>

            {/* Max Papers Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Maximum papers</Label>
                <span className="text-sm font-medium tabular-nums">
                  {maxPapers}
                </span>
              </div>
              <Slider
                value={[maxPapers]}
                onValueChange={([value]) => setMaxPapers(value)}
                min={10}
                max={200}
                step={10}
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={expandPreview.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handlePreview} disabled={expandPreview.isPending}>
              {expandPreview.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Preview Papers'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paper Preview Dialog */}
      {previewData && (
        <PaperPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          papers={previewData.papers}
          stats={previewData.stats}
          searchQuery={previewData.searchQuery}
          isCreating={expandCollection.isPending}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          confirmButtonText={`Add to Collection (${previewData.papers.length})`}
        />
      )}
    </>
  );
}
