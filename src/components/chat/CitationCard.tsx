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
  // Check if this is a generic collection citation
  const isGenericCitation = paper.paperId === '__collection__';

  // Format relevance score as percentage
  const relevancePercentage = paper.relevanceScore
    ? Math.round(paper.relevanceScore * 100)
    : null;

  // For generic citation, display a different UI
  if (isGenericCitation) {
    return (
      <Card className="border-l-4 border-l-purple-500 bg-purple-50/50">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-purple-900">
                Based on Collection Papers
              </p>
              <p className="text-xs text-purple-700 mt-1">
                This answer was generated using papers from your collection.
              </p>
              <a
                href={`/collections/${collectionId}?tab=papers`}
                className="text-xs text-purple-600 hover:text-purple-800 hover:underline mt-1 inline-block"
              >
                View all papers →
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Regular citation card for specific papers
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
