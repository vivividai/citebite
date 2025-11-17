'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { FileText, Clock } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Collection } from '@/hooks/useCollections';
import { CollectionProgress } from './CollectionProgress';

interface CollectionCardProps {
  collection: Collection;
}

export function CollectionCard({ collection }: CollectionCardProps) {
  const { id, name, search_query, created_at, totalPapers, indexedPapers } =
    collection;

  const isProcessing = indexedPapers < totalPapers;

  return (
    <Link href={`/collections/${id}`} className="block">
      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
        <CardHeader>
          <CardTitle className="line-clamp-2">{name}</CardTitle>
          <CardDescription className="line-clamp-1">
            {search_query}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Paper count */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>
              {totalPapers} paper{totalPapers !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Created date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Created{' '}
              {formatDistanceToNow(new Date(created_at), { addSuffix: true })}
            </span>
          </div>

          {/* Progress indicator */}
          {isProcessing && totalPapers > 0 ? (
            <CollectionProgress
              collectionId={id}
              totalPapers={totalPapers}
              indexedPapers={indexedPapers}
            />
          ) : (
            <div className="text-sm text-green-600 dark:text-green-400">
              ✓ All papers indexed ({indexedPapers}/{totalPapers})
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
