'use client';

import type { GraphNode } from '@/types/graph';
import { FileText, Users, Calendar, Award, Building2 } from 'lucide-react';

interface NodeTooltipProps {
  node: GraphNode;
  position: { x: number; y: number };
}

/**
 * Tooltip displayed when hovering over a node in the graph
 */
export function NodeTooltip({ node, position }: NodeTooltipProps) {
  // Truncate title if too long
  const truncatedTitle =
    node.title.length > 100 ? node.title.slice(0, 100) + '...' : node.title;

  // Truncate authors if too long
  const truncatedAuthors =
    node.authors.length > 80 ? node.authors.slice(0, 80) + '...' : node.authors;

  return (
    <div
      className="absolute z-50 bg-popover border border-border rounded-lg shadow-lg p-4 max-w-sm pointer-events-none"
      style={{
        left: position.x + 10,
        top: position.y + 10,
        transform: 'translate(0, -50%)',
      }}
    >
      {/* Title */}
      <h4 className="font-semibold text-sm text-foreground leading-tight mb-2">
        {truncatedTitle}
      </h4>

      {/* Meta info */}
      <div className="space-y-1.5 text-xs text-muted-foreground">
        {/* Authors */}
        {node.authors && (
          <div className="flex items-start gap-2">
            <Users className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{truncatedAuthors}</span>
          </div>
        )}

        {/* Year & Venue */}
        <div className="flex items-center gap-4">
          {node.year && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{node.year}</span>
            </div>
          )}
          {node.venue && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate max-w-[150px]">{node.venue}</span>
            </div>
          )}
        </div>

        {/* Citation count */}
        {node.citationCount !== null && (
          <div className="flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5" />
            <span>{node.citationCount.toLocaleString()} citations</span>
          </div>
        )}

        {/* Vector status indicator */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border mt-2">
          <FileText className="h-3.5 w-3.5" />
          <span
            className={
              node.vectorStatus === 'completed'
                ? 'text-green-600 dark:text-green-400'
                : node.vectorStatus === 'failed'
                  ? 'text-red-500'
                  : 'text-yellow-600 dark:text-yellow-400'
            }
          >
            {node.vectorStatus === 'completed'
              ? 'PDF Indexed'
              : node.vectorStatus === 'failed'
                ? 'PDF Failed'
                : 'PDF Pending'}
          </span>
        </div>
      </div>
    </div>
  );
}
