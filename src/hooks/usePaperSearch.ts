'use client';

import { useState, useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useDebouncedCallback } from 'use-debounce';

/**
 * Search type options
 * Note: Author search was removed due to Semantic Scholar API limitations
 * (only returns limited papers per author, sorted by citations)
 */
export type SearchType = 'title' | 'keywords';

/**
 * Search filters
 */
export interface SearchFilters {
  yearFrom?: number;
  yearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
}

/**
 * Paper search result item
 */
export interface PaperSearchResult {
  paperId: string;
  title: string;
  authors: Array<{ name: string }>;
  year: number | null;
  abstract: string | null;
  citationCount: number | null;
  venue: string | null;
  isOpenAccess: boolean;
  openAccessPdfUrl: string | null;
}

/**
 * API response structure
 */
interface SearchResponse {
  success: boolean;
  data: {
    papers: PaperSearchResult[];
    total: number;
    offset: number;
    hasMore: boolean;
  };
}

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

/**
 * Build query string from parameters
 */
function buildSearchUrl(
  query: string,
  searchType: SearchType,
  filters: SearchFilters,
  offset: number
): string {
  const params = new URLSearchParams();
  params.set('query', query);
  params.set('searchType', searchType);
  params.set('offset', offset.toString());
  params.set('limit', PAGE_SIZE.toString());

  if (filters.yearFrom) {
    params.set('yearFrom', filters.yearFrom.toString());
  }
  if (filters.yearTo) {
    params.set('yearTo', filters.yearTo.toString());
  }
  if (filters.minCitations !== undefined) {
    params.set('minCitations', filters.minCitations.toString());
  }
  if (filters.openAccessOnly) {
    params.set('openAccessOnly', 'true');
  }

  return `/api/papers/search?${params.toString()}`;
}

/**
 * Fetch papers from API
 */
async function fetchPapers(
  query: string,
  searchType: SearchType,
  filters: SearchFilters,
  pageParam: number
): Promise<SearchResponse['data']> {
  const url = buildSearchUrl(query, searchType, filters, pageParam);
  const res = await fetch(url);

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to search papers');
  }

  const data: SearchResponse = await res.json();
  return data.data;
}

/**
 * Hook to search for papers with debouncing and infinite loading
 */
export function usePaperSearch() {
  const [query, setQueryState] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('keywords');
  const [filters, setFilters] = useState<SearchFilters>({});

  // Debounced query setter
  const debouncedSetQuery = useDebouncedCallback((value: string) => {
    setDebouncedQuery(value);
  }, DEBOUNCE_MS);

  // Update query with debouncing
  const setQuery = useCallback(
    (value: string) => {
      setQueryState(value);
      debouncedSetQuery(value);
    },
    [debouncedSetQuery]
  );

  // Infinite query for pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['paperSearch', debouncedQuery, searchType, filters],
    queryFn: ({ pageParam }) =>
      fetchPapers(debouncedQuery, searchType, filters, pageParam),
    getNextPageParam: lastPage => {
      if (!lastPage.hasMore) return undefined;
      return lastPage.offset + PAGE_SIZE;
    },
    initialPageParam: 0,
    enabled: debouncedQuery.length >= 2, // Only search with 2+ characters
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Flatten pages into single array
  const results = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.papers);
  }, [data]);

  // Total count from first page
  const total = data?.pages?.[0]?.total ?? 0;

  // Load more handler
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Update filters
  const updateFilters = useCallback((newFilters: Partial<SearchFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Reset filters
  const resetFilters = useCallback(() => {
    setFilters({});
  }, []);

  return {
    // Query state
    query,
    setQuery,
    searchType,
    setSearchType,
    filters,
    updateFilters,
    resetFilters,

    // Results
    results,
    total,

    // Loading states
    isLoading,
    isFetching,
    isFetchingNextPage,
    isError,
    error: error as Error | null,

    // Pagination
    hasMore: hasNextPage ?? false,
    loadMore,

    // Actions
    refetch,
  };
}
