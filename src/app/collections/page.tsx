'use client';

import { useCollections } from '@/hooks/useCollections';
import { CollectionCard } from '@/components/collections/CollectionCard';
import { CreateCollectionDialog } from '@/components/collections/CreateCollectionDialog';
import { Loader2, BookOpen } from 'lucide-react';

export default function CollectionsPage() {
  const { data: collections, isLoading, error } = useCollections();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <p className="text-destructive">Failed to load collections</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  const isEmpty = !collections || collections.length === 0;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Collections</h1>
          <p className="text-muted-foreground mt-1">
            Manage your research paper collections
          </p>
        </div>
        <CreateCollectionDialog />
      </div>

      {/* Empty State */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6">
          <div className="rounded-full bg-primary/10 p-6">
            <BookOpen className="h-12 w-12 text-primary" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-semibold">No collections yet</h2>
            <p className="text-muted-foreground max-w-md">
              Create your first collection to start collecting and chatting with
              research papers.
            </p>
          </div>
          <CreateCollectionDialog />
        </div>
      ) : (
        /* Collections Grid */
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {collections.map(collection => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </div>
  );
}
