'use client';

import { Library, Loader2 } from 'lucide-react';
import { useCollections } from '@/hooks/useCollections';
import { CreateCollectionDialog } from '@/components/collections/CreateCollectionDialog';
import { CollectionSidebarItem } from './CollectionSidebarItem';
import { useDashboard } from '@/context/DashboardContext';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * Collections sidebar for the library section
 * Shows list of user's collections with create button
 */
export function CollectionsSidebar() {
  const { data: collections, isLoading, error } = useCollections();
  const { selectedCollectionId, setSelectedCollectionId } = useDashboard();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--sidebar-border))]">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Library</h2>
        </div>
      </div>

      {/* Create Collection Button */}
      <div className="px-3 py-2">
        <CreateCollectionDialog variant="sidebar" />
      </div>

      {/* Collections List */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 px-4">
              <p className="text-sm text-destructive">Failed to load</p>
              <p className="text-xs text-muted-foreground mt-1">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : !collections || collections.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-sm text-muted-foreground">
                No collections yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first collection to get started
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {collections.map(collection => (
                <CollectionSidebarItem
                  key={collection.id}
                  collection={collection}
                  isSelected={selectedCollectionId === collection.id}
                  onSelect={() => setSelectedCollectionId(collection.id)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
