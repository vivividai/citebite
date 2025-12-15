'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useCollection, CollectionDetail } from '@/hooks/useCollection';

export type ActiveSection = 'library' | 'shop' | 'settings';

interface DashboardContextValue {
  activeSection: ActiveSection;
  selectedCollectionId: string | null;
  setSelectedCollectionId: (id: string | null) => void;
  collection: CollectionDetail | null;
  isLoadingCollection: boolean;
  collectionError: Error | null;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

interface DashboardProviderProps {
  children: ReactNode;
}

/**
 * Dashboard context provider
 * Manages active section and selected collection state
 * Syncs with URL for deep linking
 */
export function DashboardProvider({ children }: DashboardProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Derive active section from pathname
  const activeSection: ActiveSection = (() => {
    if (pathname.startsWith('/dashboard/shop')) return 'shop';
    if (pathname.startsWith('/dashboard/settings')) return 'settings';
    return 'library';
  })();

  // Get collection ID from URL
  const urlCollectionId = searchParams.get('collection');
  const [selectedCollectionId, setSelectedCollectionIdState] = useState<
    string | null
  >(urlCollectionId);

  // Sync state with URL on mount and URL changes
  useEffect(() => {
    setSelectedCollectionIdState(urlCollectionId);
  }, [urlCollectionId]);

  // Update URL when collection changes
  const setSelectedCollectionId = (id: string | null) => {
    setSelectedCollectionIdState(id);

    // Update URL
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('collection', id);
    } else {
      params.delete('collection');
    }

    const newUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.push(newUrl, { scroll: false });
  };

  // Fetch collection data when ID is selected
  const {
    data: collection,
    isLoading: isLoadingCollection,
    error: collectionError,
  } = useCollection(selectedCollectionId ?? '');

  const value: DashboardContextValue = {
    activeSection,
    selectedCollectionId,
    setSelectedCollectionId,
    collection: collection ?? null,
    isLoadingCollection,
    collectionError: collectionError as Error | null,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

/**
 * Hook to access dashboard context
 */
export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
