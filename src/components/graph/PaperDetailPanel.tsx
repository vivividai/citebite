'use client';

import { useState } from 'react';
import type { GraphNode } from '@/types/graph';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileText,
  Calendar,
  Award,
  Building2,
  ExternalLink,
  GitBranch,
  ArrowRight,
} from 'lucide-react';

interface PaperDetailPanelProps {
  node: GraphNode | null;
  onClose: () => void;
  onExpand?: (paperId: string) => void;
}

/**
 * Side panel showing detailed paper information when a node is clicked
 */
export function PaperDetailPanel({
  node,
  onClose,
  onExpand,
}: PaperDetailPanelProps) {
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);

  if (!node) return null;

  const relationshipLabel =
    node.relationshipType === 'search'
      ? 'Original Search'
      : node.relationshipType === 'reference'
        ? 'From References'
        : 'From Citations';

  const relationshipColor =
    node.relationshipType === 'search'
      ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
      : node.relationshipType === 'reference'
        ? 'bg-green-500/10 text-green-700 dark:text-green-300'
        : 'bg-purple-500/10 text-purple-700 dark:text-purple-300';

  // Truncate abstract if too long
  const abstractText = node.abstract || 'No abstract available.';
  const isLongAbstract = abstractText.length > 300;
  const displayAbstract =
    isLongAbstract && !isAbstractExpanded
      ? abstractText.slice(0, 300) + '...'
      : abstractText;

  return (
    <Dialog open={!!node} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-start gap-2 mb-2">
            <Badge className={relationshipColor} variant="secondary">
              {relationshipLabel}
            </Badge>
          </div>
          <DialogTitle className="text-left leading-tight pr-8">
            {node.title}
          </DialogTitle>
          <DialogDescription className="text-left">
            {node.authors}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto pr-4">
          <div className="py-4 space-y-6">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-4">
              {node.year && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{node.year}</span>
                </div>
              )}
              {node.citationCount !== null && (
                <div className="flex items-center gap-2 text-sm">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  <span>{node.citationCount.toLocaleString()} citations</span>
                </div>
              )}
              {node.venue && (
                <div className="flex items-center gap-2 text-sm col-span-2">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{node.venue}</span>
                </div>
              )}
            </div>

            {/* Indexing status */}
            <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>PDF Status:</span>
              <span
                className={
                  node.vectorStatus === 'completed'
                    ? 'text-green-600 dark:text-green-400 font-medium'
                    : node.vectorStatus === 'failed'
                      ? 'text-red-500 font-medium'
                      : 'text-yellow-600 dark:text-yellow-400 font-medium'
                }
              >
                {node.vectorStatus === 'completed'
                  ? 'Indexed'
                  : node.vectorStatus === 'failed'
                    ? 'Failed'
                    : 'Pending'}
              </span>
            </div>

            {/* Similarity score */}
            {node.similarity !== null && (
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    Relevance to collection
                  </span>
                  <span className="font-medium">
                    {(node.similarity * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${node.similarity * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Abstract */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Abstract</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {displayAbstract}
              </p>
              {isLongAbstract && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setIsAbstractExpanded(!isAbstractExpanded)}
                >
                  {isAbstractExpanded ? 'Show less' : 'Show more'}
                </Button>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-4 border-t">
              {/* Semantic Scholar link */}
              <Button variant="outline" className="justify-start" asChild>
                <a
                  href={`https://www.semanticscholar.org/paper/${node.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on Semantic Scholar
                </a>
              </Button>

              {/* Expand button */}
              {onExpand && (
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => onExpand(node.id)}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  Expand from this paper
                  <ArrowRight className="h-4 w-4 ml-auto" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
