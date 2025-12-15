'use client';

import { useDashboard } from '@/context/DashboardContext';
import { PaperList } from '@/components/collections/PaperList';
import { PaperGraph } from '@/components/graph/PaperGraph';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { FileText, Loader2 } from 'lucide-react';

/**
 * Empty state when no collection is selected
 */
function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Collection Selected</h3>
        <p className="text-sm text-muted-foreground">
          Select a collection from the sidebar to view papers and explore the
          citation graph.
        </p>
      </div>
    </div>
  );
}

/**
 * Loading state while fetching collection
 */
function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/**
 * Error state when collection fetch fails
 */
function ErrorState({ error }: { error: Error }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="text-destructive text-lg font-semibold mb-2">
          Failed to load collection
        </div>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  );
}

/**
 * Content panel with PaperList and PaperGraph
 * Split layout with resizable panels
 */
export function ContentPanel() {
  const {
    selectedCollectionId,
    collection,
    isLoadingCollection,
    collectionError,
  } = useDashboard();

  // Show empty state if no collection selected
  if (!selectedCollectionId) {
    return <EmptyState />;
  }

  // Show loading state
  if (isLoadingCollection) {
    return <LoadingState />;
  }

  // Show error state
  if (collectionError) {
    return <ErrorState error={collectionError} />;
  }

  // Show empty state if collection not found
  if (!collection) {
    return <EmptyState />;
  }

  return (
    <ResizablePanelGroup direction="vertical" className="h-full">
      {/* Paper List - Top */}
      <ResizablePanel defaultSize={50} minSize={20}>
        <div className="h-full overflow-auto p-4">
          <PaperList collectionId={collection.id} />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Paper Graph - Bottom */}
      <ResizablePanel defaultSize={50} minSize={20}>
        <div className="h-full overflow-hidden">
          <PaperGraph collectionId={collection.id} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
