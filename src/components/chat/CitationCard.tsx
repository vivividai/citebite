'use client';

import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface CitedPaper {
  paperId: string;
  title: string;
  relevanceScore?: number;
  citedInContext?: string;
}

interface CitationCardProps {
  paper: CitedPaper;
  collectionId: string;
}

export function CitationCard({ paper, collectionId }: CitationCardProps) {
  // Format relevance score as percentage
  const relevancePercentage = paper.relevanceScore
    ? Math.round(paper.relevanceScore * 100)
    : null;

  return (
    <Card className="border-l-4 border-l-blue-500 hover:shadow-sm transition-shadow">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <a
              href={`/collections/${collectionId}?tab=papers&highlight=${paper.paperId}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline line-clamp-2"
            >
              {paper.title}
            </a>
            {relevancePercentage !== null && (
              <Badge
                variant="outline"
                className="mt-1.5 text-xs bg-blue-50 text-blue-700 border-blue-200"
              >
                {relevancePercentage}% relevant
              </Badge>
            )}
            {paper.citedInContext && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                {paper.citedInContext}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
