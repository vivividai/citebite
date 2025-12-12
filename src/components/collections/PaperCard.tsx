'use client';

import { useState } from 'react';
import { Paper } from '@/hooks/useCollectionPapers';
import { useRemovePaper } from '@/hooks/useRemovePaper';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Quote,
  CheckCircle,
  Loader2,
  AlertCircle,
  FileText,
  BookOpen,
  Download,
  Trash2,
  Network,
} from 'lucide-react';
import { PaperAbstractModal } from './PaperAbstractModal';
import { PdfUploadButton } from '@/components/papers/PdfUploadButton';

interface PaperCardProps {
  paper: Paper;
  collectionId?: string;
  selectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (paperId: string) => void;
  onExpand?: (paperId: string, paperTitle: string, degree: number) => void;
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'completed') {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-green-50 text-green-700 border-green-200"
      >
        <CheckCircle className="h-3 w-3" />
        Indexed
      </Badge>
    );
  }

  if (status === 'failed') {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-red-50 text-red-700 border-red-200"
      >
        <AlertCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="gap-1 bg-blue-50 text-blue-700 border-blue-200"
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      Pending
    </Badge>
  );
}

export function PaperCard({
  paper,
  collectionId,
  selectionMode = false,
  isSelected = false,
  onSelect,
  onExpand,
}: PaperCardProps) {
  const [abstractModalOpen, setAbstractModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const removePaper = useRemovePaper();

  const authorNames =
    paper.authors?.map(a => a.name).join(', ') || 'Unknown authors';
  const isOpenAccess = !!paper.open_access_pdf_url;

  const handleRemove = () => {
    if (!collectionId) return;

    removePaper.mutate(
      { collectionId, paperId: paper.paper_id },
      {
        onSuccess: () => {
          setDeleteDialogOpen(false);
        },
      }
    );
  };

  const handleCardClick = () => {
    if (selectionMode && onSelect) {
      onSelect(paper.paper_id);
    }
  };

  return (
    <>
      <Card
        className={`hover:shadow-md transition-shadow ${
          selectionMode ? 'cursor-pointer' : ''
        } ${isSelected ? 'ring-2 ring-primary' : ''}`}
        onClick={selectionMode ? handleCardClick : undefined}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            {selectionMode && (
              <div className="flex-shrink-0 pt-1">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onSelect?.(paper.paper_id)}
                  onClick={e => e.stopPropagation()}
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <CardTitle className="line-clamp-2 text-lg">
                {paper.title}
              </CardTitle>
              <CardDescription className="mt-2 line-clamp-1">
                {authorNames} {paper.year && `• ${paper.year}`}
              </CardDescription>
            </div>
            <div className="flex-shrink-0">
              <StatusBadge status={paper.vector_status} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1">
              <Quote className="h-4 w-4" />
              <span>{paper.citation_count ?? 0} citations</span>
            </div>
            {isOpenAccess && (
              <Badge variant="secondary" className="gap-1">
                <FileText className="h-3 w-3" />
                Open Access
              </Badge>
            )}
            {paper.venue && (
              <span className="text-xs truncate max-w-xs">{paper.venue}</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={e => {
                e.stopPropagation();
                setAbstractModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <BookOpen className="h-4 w-4" />
              View Abstract
            </Button>
            {isOpenAccess && (
              <Button
                variant="outline"
                size="sm"
                asChild
                onClick={e => e.stopPropagation()}
              >
                <a
                  href={paper.open_access_pdf_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </a>
              </Button>
            )}
            {/* Show Upload PDF button for failed papers */}
            {paper.vector_status === 'failed' && collectionId && (
              <div onClick={e => e.stopPropagation()}>
                <PdfUploadButton
                  paperId={paper.paper_id}
                  collectionId={collectionId}
                />
              </div>
            )}

            {/* Expand Button - find related papers via references/citations */}
            {!selectionMode && collectionId && onExpand && (
              <Button
                variant="outline"
                size="sm"
                onClick={e => {
                  e.stopPropagation();
                  onExpand(paper.paper_id, paper.title, paper.degree);
                }}
                className="flex items-center gap-1"
                title="Find related papers"
              >
                <Network className="h-4 w-4" />
                Expand
              </Button>
            )}

            {/* Remove Button - only show when not in selection mode */}
            {!selectionMode && collectionId && (
              <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={e => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={e => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove paper?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2">
                        <p>
                          This will remove &quot;{paper.title}&quot; from this
                          collection.
                        </p>
                        <p className="text-sm">
                          The following will be deleted:
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
                    <AlertDialogCancel disabled={removePaper.isPending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemove}
                      disabled={removePaper.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {removePaper.isPending ? 'Removing...' : 'Remove'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Abstract Modal */}
      <PaperAbstractModal
        paper={paper}
        open={abstractModalOpen}
        onOpenChange={setAbstractModalOpen}
      />
    </>
  );
}
