'use client';

import { useCollection } from '@/hooks/useCollection';
import { CollectionHeader } from '@/components/collections/CollectionHeader';
import { PaperList } from '@/components/collections/PaperList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, AlertCircle, MessageSquare, Lightbulb } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function CollectionDetailPage() {
  const params = useParams();
  const collectionId = params.id as string;

  const { data: collection, isLoading, error } = useCollection(collectionId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    const is401 =
      error instanceof Error &&
      'statusCode' in error &&
      error.statusCode === 401;
    const is404 =
      error instanceof Error &&
      'statusCode' in error &&
      error.statusCode === 404;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            {is401
              ? 'Unauthorized'
              : is404
                ? 'Collection Not Found'
                : 'Error Loading Collection'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {is401
              ? 'Please log in to view this collection.'
              : is404
                ? "The collection you're looking for doesn't exist or you don't have access to it."
                : error instanceof Error
                  ? error.message
                  : 'An unknown error occurred.'}
          </p>
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <h1 className="text-2xl font-bold">Collection Not Found</h1>
          <p className="text-muted-foreground mt-2">
            The collection you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <CollectionHeader collection={collection} />

      <Tabs defaultValue="papers" className="space-y-6">
        <TabsList>
          <TabsTrigger value="papers" className="gap-2">
            Papers
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="papers" className="space-y-4">
          <PaperList collectionId={collection.id} />
        </TabsContent>

        <TabsContent value="chat" className="space-y-4">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <MessageSquare className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Chat Coming Soon</h3>
              <p className="text-sm text-muted-foreground mt-1">
                The chat interface will be available in Phase 2.7-2.9
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Lightbulb className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Insights Coming Soon</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Auto-generated insights will be available in Phase 6
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
