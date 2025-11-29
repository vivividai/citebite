'use client';

/**
 * Bulk Upload Dialog Component
 * Multi-step wizard for uploading and matching multiple PDFs
 */

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
} from 'lucide-react';
import { useBulkUpload, BulkUploadResult } from '@/hooks/useBulkUpload';
import { useBulkConfirm } from '@/hooks/useBulkConfirm';
import { MatchReviewList } from './MatchReviewList';
import toast from 'react-hot-toast';

type DialogStep =
  | 'upload'
  | 'processing'
  | 'review'
  | 'confirming'
  | 'complete';

// Paper from props (uses paper_id from database)
interface PaperProp {
  paper_id: string;
  title: string;
}

// Paper from API response (uses paperId)
interface UnmatchedPaper {
  paperId: string;
  title: string;
}

interface BulkUploadDialogProps {
  collectionId: string;
  papersNeedingPdf: PaperProp[];
  trigger?: React.ReactNode;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES = 50;

export function BulkUploadDialog({
  collectionId,
  papersNeedingPdf,
  trigger,
}: BulkUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>('upload');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadResults, setUploadResults] = useState<BulkUploadResult[]>([]);
  const [unmatchedPapers, setUnmatchedPapers] = useState<UnmatchedPaper[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [matchOverrides, setMatchOverrides] = useState<Record<string, string>>(
    {}
  );
  const [confirmedCount, setConfirmedCount] = useState(0);

  const { mutate: uploadFiles } = useBulkUpload(collectionId);

  const { mutate: confirmMatches } = useBulkConfirm(collectionId);

  // Handle file selection
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);

      // Validate files
      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of files) {
        if (file.type !== 'application/pdf') {
          errors.push(`${file.name}: Not a PDF file`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: Exceeds 100MB limit`);
          continue;
        }
        if (validFiles.length >= MAX_FILES) {
          errors.push(`Maximum ${MAX_FILES} files allowed`);
          break;
        }
        validFiles.push(file);
      }

      if (errors.length > 0) {
        toast.error(errors.slice(0, 3).join('\n'));
      }

      setSelectedFiles(prev => {
        const combined = [...prev, ...validFiles];
        return combined.slice(0, MAX_FILES);
      });

      // Reset input
      e.target.value = '';
    },
    []
  );

  // Handle file removal
  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Handle upload
  const handleUpload = useCallback(() => {
    if (selectedFiles.length === 0) {
      toast.error('Please select files to upload');
      return;
    }

    setStep('processing');

    uploadFiles(
      { files: selectedFiles },
      {
        onSuccess: data => {
          setSessionId(data.sessionId);
          setUploadResults(data.results);
          setUnmatchedPapers(data.unmatchedPapers);
          setStep('review');
        },
        onError: () => {
          setStep('upload');
        },
      }
    );
  }, [selectedFiles, uploadFiles]);

  // Handle match override
  const handleMatchChange = useCallback((fileId: string, paperId: string) => {
    setMatchOverrides(prev => ({
      ...prev,
      [fileId]: paperId,
    }));
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (!sessionId) return;

    // Build final matches (use override if set, otherwise use auto-match)
    const matches = uploadResults
      .map(result => {
        const paperId = matchOverrides[result.fileId] || result.match.paperId;
        if (!paperId) return null;
        return { fileId: result.fileId, paperId };
      })
      .filter((m): m is { fileId: string; paperId: string } => m !== null);

    if (matches.length === 0) {
      toast.error('No valid matches to confirm');
      return;
    }

    setStep('confirming');

    confirmMatches(
      { sessionId, matches },
      {
        onSuccess: data => {
          setConfirmedCount(data.results.successCount);
          setStep('complete');
        },
        onError: () => {
          setStep('review');
        },
      }
    );
  }, [sessionId, uploadResults, matchOverrides, confirmMatches]);

  // Handle dialog close
  const handleClose = useCallback(() => {
    setOpen(false);
    // Reset state after animation
    setTimeout(() => {
      setStep('upload');
      setSelectedFiles([]);
      setUploadResults([]);
      setUnmatchedPapers([]);
      setSessionId(null);
      setMatchOverrides({});
      setConfirmedCount(0);
    }, 200);
  }, []);

  // Calculate match statistics
  const matchStats = uploadResults.reduce(
    (acc, result) => {
      const confidence =
        matchOverrides[result.fileId] !== undefined
          ? 'manual'
          : result.match.confidence;

      if (confidence === 'high') acc.high++;
      else if (confidence === 'medium') acc.medium++;
      else if (confidence === 'manual') acc.manual++;
      else acc.none++;

      return acc;
    },
    { high: 0, medium: 0, none: 0, manual: 0 }
  );

  // Count matches that will be confirmed
  const confirmableCount = uploadResults.filter(
    r => matchOverrides[r.fileId] || r.match.paperId
  ).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload ({papersNeedingPdf.length} papers need PDFs)
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload PDFs</DialogTitle>
          <DialogDescription>
            {step === 'upload' &&
              'Upload multiple PDFs and automatically match them to papers in your collection.'}
            {step === 'processing' && 'Uploading and analyzing PDFs...'}
            {step === 'review' &&
              'Review the matches and make corrections if needed.'}
            {step === 'confirming' && 'Processing your confirmations...'}
            {step === 'complete' && 'Upload complete!'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* Drop Zone */}
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="bulk-upload-input"
              />
              <label
                htmlFor="bulk-upload-input"
                className="cursor-pointer block"
              >
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">
                  Drag & drop PDF files here
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Up to {MAX_FILES} files, 100MB each
                </p>
              </label>
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium">
                    Selected Files ({selectedFiles.length})
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFiles([])}
                  >
                    Clear All
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate flex-1">
                        {file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFile(index)}
                        className="h-6 w-6 p-0"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {papersNeedingPdf.length} papers in this collection need PDFs
              </span>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0}
              >
                Upload & Match ({selectedFiles.length} files)
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === 'processing' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <p className="font-medium">Uploading and analyzing PDFs...</p>
              <p className="text-sm text-muted-foreground mt-1">
                This may take a moment for large files
              </p>
            </div>
            <Progress value={50} className="w-64 mx-auto" />
          </div>
        )}

        {/* Step 3: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            {/* Match Summary */}
            <div className="flex gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm">
                  {matchStats.high} high confidence
                </span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm">{matchStats.medium} medium</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm">{matchStats.none} needs review</span>
              </div>
              {matchStats.manual > 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">
                    {matchStats.manual} manually set
                  </span>
                </div>
              )}
            </div>

            {/* Match Review List */}
            <MatchReviewList
              results={uploadResults}
              unmatchedPapers={unmatchedPapers}
              matchOverrides={matchOverrides}
              onMatchChange={handleMatchChange}
            />

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {confirmableCount} of {uploadResults.length} files will be
                processed
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={confirmableCount === 0}
                >
                  Confirm & Index ({confirmableCount})
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Confirming */}
        {step === 'confirming' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <p className="font-medium">Processing confirmations...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Moving files and queuing indexing jobs
              </p>
            </div>
          </div>
        )}

        {/* Step 5: Complete */}
        {step === 'complete' && (
          <div className="py-12 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
            <div>
              <p className="text-lg font-medium">
                {confirmedCount} PDFs uploaded successfully!
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Indexing has been queued. You can track progress on the Papers
                tab.
              </p>
            </div>
            <Button onClick={handleClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
