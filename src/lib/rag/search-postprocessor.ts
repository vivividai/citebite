/**
 * Search Result Postprocessor for Multimodal RAG
 *
 * Enriches search results by:
 * - Adding image URLs to figure chunks
 * - Fetching related figures referenced in text chunks
 */

import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { getSignedFigureUrl } from '@/lib/storage/supabaseStorage';
import { SearchResult } from './search';

export interface EnrichedSearchResults {
  /** Main search results (text and figure chunks) */
  chunks: SearchResult[];
  /** Figures referenced in text chunks but not in main results */
  relatedFigures: SearchResult[];
}

/**
 * Enrich search results with figure image URLs and related figures
 *
 * This function:
 * 1. Adds signed URLs to all figure chunks
 * 2. Finds figures referenced in text chunks that aren't in the results
 * 3. Fetches those related figures from the database
 *
 * @param results - Raw search results
 * @param collectionId - Collection ID for fetching related figures
 * @returns Enriched results with image URLs and related figures
 *
 * @example
 * ```typescript
 * const raw = await hybridSearch(collectionId, query);
 * const enriched = await enrichSearchResultsWithFigures(raw, collectionId);
 * // enriched.chunks has imageUrl set for figures
 * // enriched.relatedFigures has additional figures from text references
 * ```
 */
export async function enrichSearchResultsWithFigures(
  results: SearchResult[],
  collectionId: string
): Promise<EnrichedSearchResults> {
  // 1. Collect figure numbers already in results
  const includedFigureNumbers = new Set(
    results
      .filter(r => r.chunkType === 'figure' && r.figureNumber)
      .map(r => r.figureNumber!.toLowerCase())
  );

  // 2. Collect figure numbers referenced by text chunks (not yet included)
  const referencedFigureNumbers = new Set<string>();
  for (const result of results) {
    if (result.chunkType === 'text' && result.referencedFigures) {
      for (const figNum of result.referencedFigures) {
        if (!includedFigureNumbers.has(figNum.toLowerCase())) {
          referencedFigureNumbers.add(figNum);
        }
      }
    }
  }

  // 3. Fetch related figures from database
  let relatedFigures: SearchResult[] = [];
  if (referencedFigureNumbers.size > 0) {
    relatedFigures = await fetchFiguresByNumbers(
      collectionId,
      Array.from(referencedFigureNumbers)
    );
  }

  // 4. Add image URLs to all figure chunks
  const enrichedChunks = await Promise.all(
    results.map(async r => {
      if (r.chunkType === 'figure' && r.imageStoragePath) {
        try {
          const imageUrl = await getSignedFigureUrl(r.imageStoragePath);
          return { ...r, imageUrl };
        } catch (error) {
          console.warn(
            `Failed to get signed URL for ${r.imageStoragePath}:`,
            error
          );
          return r;
        }
      }
      return r;
    })
  );

  const enrichedRelatedFigures = await Promise.all(
    relatedFigures.map(async r => {
      if (r.imageStoragePath) {
        try {
          const imageUrl = await getSignedFigureUrl(r.imageStoragePath);
          return { ...r, imageUrl };
        } catch (error) {
          console.warn(
            `Failed to get signed URL for ${r.imageStoragePath}:`,
            error
          );
          return r;
        }
      }
      return r;
    })
  );

  return {
    chunks: enrichedChunks,
    relatedFigures: enrichedRelatedFigures,
  };
}

/**
 * Fetch figure chunks by their figure numbers
 */
async function fetchFiguresByNumbers(
  collectionId: string,
  figureNumbers: string[]
): Promise<SearchResult[]> {
  if (figureNumbers.length === 0) return [];

  const supabase = createAdminSupabaseClient();

  // Normalize figure numbers for case-insensitive search
  const normalizedNumbers = figureNumbers.map(n => n.toLowerCase());

  const { data, error } = await supabase
    .from('paper_chunks')
    .select('*')
    .eq('collection_id', collectionId)
    .eq('chunk_type', 'figure')
    .filter('figure_number', 'ilike', `%(${normalizedNumbers.join('|')})%`);

  if (error) {
    console.warn('Failed to fetch related figures:', error);
    return [];
  }

  // Define the row type from the query
  interface FigureChunkRow {
    id: string;
    paper_id: string;
    content: string;
    chunk_index: number;
    figure_number: string | null;
    figure_caption: string | null;
    figure_description: string | null;
    image_storage_path: string | null;
    page_number: number | null;
    mentioned_in_chunk_ids: string[] | null;
  }

  // Filter to exact matches (case-insensitive)
  const filteredData = (data || []).filter((row: FigureChunkRow) =>
    normalizedNumbers.includes(row.figure_number?.toLowerCase() || '')
  );

  return filteredData.map((row: FigureChunkRow) => ({
    chunkId: row.id,
    paperId: row.paper_id,
    content: row.content,
    chunkIndex: row.chunk_index,
    chunkType: 'figure' as const,
    figureNumber: row.figure_number || undefined,
    figureCaption: row.figure_caption || undefined,
    figureDescription: row.figure_description || undefined,
    imageStoragePath: row.image_storage_path || undefined,
    pageNumber: row.page_number || undefined,
    mentionedInChunkIds: row.mentioned_in_chunk_ids || undefined,
    semanticScore: 0,
    keywordScore: 0,
    combinedScore: 0,
  }));
}

/**
 * Get all figures for a specific paper
 */
export async function getPaperFigures(
  paperId: string,
  collectionId: string
): Promise<SearchResult[]> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from('paper_chunks')
    .select('*')
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId)
    .eq('chunk_type', 'figure')
    .order('page_number', { ascending: true });

  if (error) {
    console.warn(`Failed to fetch figures for paper ${paperId}:`, error);
    return [];
  }

  // Define the row type from the query
  interface PaperFigureRow {
    id: string;
    paper_id: string;
    content: string;
    chunk_index: number;
    figure_number: string | null;
    figure_caption: string | null;
    figure_description: string | null;
    image_storage_path: string | null;
    page_number: number | null;
    mentioned_in_chunk_ids: string[] | null;
  }

  const results = (data || []).map((row: PaperFigureRow) => ({
    chunkId: row.id,
    paperId: row.paper_id,
    content: row.content,
    chunkIndex: row.chunk_index,
    chunkType: 'figure' as const,
    figureNumber: row.figure_number || undefined,
    figureCaption: row.figure_caption || undefined,
    figureDescription: row.figure_description || undefined,
    imageStoragePath: row.image_storage_path || undefined,
    pageNumber: row.page_number || undefined,
    mentionedInChunkIds: row.mentioned_in_chunk_ids || undefined,
    semanticScore: 0,
    keywordScore: 0,
    combinedScore: 0,
  }));

  // Add image URLs
  return Promise.all(
    results.map(async (r: SearchResult) => {
      if (r.imageStoragePath) {
        try {
          const imageUrl = await getSignedFigureUrl(r.imageStoragePath);
          return { ...r, imageUrl };
        } catch {
          return r;
        }
      }
      return r;
    })
  );
}
