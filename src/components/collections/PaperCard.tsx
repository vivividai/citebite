'use client';

import { Paper } from '@/hooks/useCollectionPapers';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Quote,
  CheckCircle,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface PaperCardProps {
  paper: Paper;
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

export function PaperCard({ paper }: PaperCardProps) {
  const authorNames =
    paper.authors?.map(a => a.name).join(', ') || 'Unknown authors';
  const isOpenAccess = !!paper.open_access_pdf_url;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
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
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
