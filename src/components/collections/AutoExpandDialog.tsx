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
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Info, AlertTriangle } from 'lucide-react';
import { useAutoExpandPreview } from '@/hooks/useAutoExpandPreview';
import type { PaperPreview } from '@/lib/search/types';

interface AutoExpandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  searchNodeCount: number;
  onPreviewReady: (
    papers: PaperPreview[],
    stats: {
      degree1Count: number;
      degree2Count: number;
      degree3Count: number;
      totalCount: number;
    }
  ) => void;
}

/**
 * Dialog for configuring and initiating auto-expand
 */
export function AutoExpandDialog({
  open,
  onOpenChange,
  collectionId,
  searchNodeCount,
  onPreviewReady,
}: AutoExpandDialogProps) {
  // Form state
  const [degree, setDegree] = useState(1);
  const [type, setType] = useState<'references' | 'citations' | 'both'>('both');
  const [influentialOnly, setInfluentialOnly] = useState(false);
  const [maxPapersPerNode, setMaxPapersPerNode] = useState(50);

  // API mutation
  const { mutate: fetchPreview, isPending } =
    useAutoExpandPreview(collectionId);

  // Estimate scope
  const estimatedPapers = Math.min(
    searchNodeCount *
      (type === 'both' ? 2 : 1) *
      maxPapersPerNode *
      Math.pow(0.5, degree - 1), // Each degree typically yields fewer papers
    10000
  );
  const isLargeOperation = searchNodeCount > 10;

  const handlePreview = () => {
    fetchPreview(
      {
        degree,
        type,
        influentialOnly,
        maxPapersPerNode,
      },
      {
        onSuccess: data => {
          onPreviewReady(data.data.papers, data.data.stats);
        },
        onError: error => {
          console.error('Auto-expand preview failed:', error);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Auto Expand Collection</DialogTitle>
          <DialogDescription>
            Automatically discover related papers by traversing references and
            citations from your search results.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Degree Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Expansion Depth</Label>
              <span className="text-sm font-medium tabular-nums">
                {degree} degree{degree > 1 ? 's' : ''}
              </span>
            </div>
            <Slider
              value={[degree]}
              onValueChange={([value]) => setDegree(value)}
              min={1}
              max={3}
              step={1}
              className="w-full"
            />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>• Degree 1: Direct refs/citations from search results</p>
              {degree >= 2 && (
                <p>• Degree 2: + refs/citations from degree 1 papers</p>
              )}
              {degree >= 3 && (
                <p>• Degree 3: + refs/citations from degree 2 papers</p>
              )}
            </div>
          </div>

          {/* Type Select */}
          <div className="space-y-2">
            <Label className="font-medium">Relationship Type</Label>
            <Select
              value={type}
              onValueChange={v =>
                setType(v as 'references' | 'citations' | 'both')
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="references">References only</SelectItem>
                <SelectItem value="citations">Citations only</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Influential Only Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="influentialOnly"
              checked={influentialOnly}
              onCheckedChange={checked =>
                setInfluentialOnly(checked as boolean)
              }
            />
            <Label htmlFor="influentialOnly" className="text-sm font-normal">
              Only include influential papers
            </Label>
          </div>

          {/* Max Papers Per Node Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Max papers per node</Label>
              <span className="text-sm font-medium tabular-nums">
                {maxPapersPerNode}
              </span>
            </div>
            <Slider
              value={[maxPapersPerNode]}
              onValueChange={([value]) => setMaxPapersPerNode(value)}
              min={10}
              max={100}
              step={10}
              className="w-full"
            />
          </div>

          {/* Scope Estimation */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span>
                Estimated scope: ~{Math.round(estimatedPapers).toLocaleString()}{' '}
                papers from {searchNodeCount} search results
              </span>
            </div>
            {isLargeOperation && (
              <div className="flex items-start gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <span>
                  This operation may take several minutes for large collections
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handlePreview}
            disabled={isPending || searchNodeCount === 0}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching papers...
              </>
            ) : (
              'Preview'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
