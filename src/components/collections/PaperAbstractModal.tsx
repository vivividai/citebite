import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, BookOpen } from 'lucide-react';
import type { Paper } from '@/hooks/useCollectionPapers';

interface PaperAbstractModalProps {
  paper: Paper | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaperAbstractModal({
  paper,
  open,
  onOpenChange,
}: PaperAbstractModalProps) {
  if (!paper) return null;

  // Format authors for display
  const authorsText = paper.authors
    ? paper.authors.map(a => a.name).join(', ')
    : 'Unknown authors';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl leading-tight pr-6">
            {paper.title}
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-foreground font-medium">{authorsText}</span>
              {paper.year && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{paper.year}</span>
                </>
              )}
              {paper.venue && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground truncate max-w-xs">
                    {paper.venue}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {paper.citation_count !== null && (
                <Badge variant="secondary" className="text-xs">
                  {paper.citation_count} citations
                </Badge>
              )}
              {paper.open_access_pdf_url && (
                <Badge
                  variant="secondary"
                  className="bg-green-50 text-green-700 border-green-200 text-xs"
                >
                  Open Access
                </Badge>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Abstract Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Abstract</h3>
            </div>
            {paper.abstract ? (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {paper.abstract}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No abstract available for this paper.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          {paper.open_access_pdf_url && (
            <div className="flex justify-end pt-2 border-t">
              <Button variant="default" asChild>
                <a
                  href={paper.open_access_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Full Paper
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
