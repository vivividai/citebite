'use client';

import { useState } from 'react';
import { CollectionDetail } from '@/hooks/useCollection';
import { CollectionProgress } from './CollectionProgress';
import { useDeleteCollection } from '@/hooks/useDeleteCollection';
import {
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
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

interface CollectionHeaderProps {
  collection: CollectionDetail;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  );
}

export function CollectionHeader({ collection }: CollectionHeaderProps) {
  // Check if processing is complete: indexed + failed should equal total
  const isProcessing =
    collection.indexedPapers + collection.failedPapers < collection.totalPapers;
  const deleteCollection = useDeleteCollection();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDelete = () => {
    deleteCollection.mutate(collection.id);
    setIsDeleteDialogOpen(false);
  };

  return (
    <div className="mb-8 space-y-6">
      {/* Title and description with delete button */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {collection.name}
          </h1>
          <p className="text-muted-foreground mt-2">
            Search query:{' '}
            <span className="font-medium">{collection.search_query}</span>
          </p>
        </div>

        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the collection &quot;
                {collection.name}&quot; and all its data including:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>{collection.totalPapers} papers</li>
                  <li>All conversations and messages</li>
                  <li>All insights</li>
                </ul>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteCollection.isPending
                  ? 'Deleting...'
                  : 'Delete Collection'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-6">
        <Stat
          icon={FileText}
          label="Total Papers"
          value={collection.totalPapers}
        />
        <Stat
          icon={CheckCircle}
          label="Indexed"
          value={collection.indexedPapers}
        />
        {collection.failedPapers > 0 && (
          <Stat
            icon={AlertCircle}
            label="Failed"
            value={collection.failedPapers}
          />
        )}
        <Stat
          icon={Clock}
          label="Created"
          value={formatDistanceToNow(new Date(collection.created_at), {
            addSuffix: true,
          })}
        />
      </div>

      {/* Processing progress */}
      {isProcessing && (
        <CollectionProgress
          collectionId={collection.id}
          totalPapers={collection.totalPapers}
          indexedPapers={collection.indexedPapers}
        />
      )}
    </div>
  );
}
