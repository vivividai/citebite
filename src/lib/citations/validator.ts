/**
 * Citation validation and enrichment functions
 *
 * Validates citations from Gemini responses and enriches them with
 * full paper metadata from the database.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';
import { CitedPaper } from '@/lib/db/messages';
import { getPapersByIds } from '@/lib/db/papers';

/**
 * Validate and enrich citations with full paper metadata
 *
 * Takes citations extracted from Gemini's grounding metadata and:
 * 1. Fetches full paper details from database
 * 2. Filters out papers that don't exist in the collection (hallucinations)
 * 3. Enriches citations with complete metadata (title, authors, etc.)
 *
 * @param supabase - Supabase client
 * @param citations - Array of cited papers from Gemini
 * @param collectionId - Collection ID to validate papers belong to
 * @returns Promise with validated and enriched citations
 *
 * @example
 * ```typescript
 * const validCitations = await validateAndEnrichCitations(
 *   supabase,
 *   [
 *     { paperId: 'abc123', title: 'Unknown', relevanceScore: 0.95 }
 *   ],
 *   'collection_id'
 * );
 * // Returns: [{ paperId: 'abc123', title: 'Actual Paper Title', relevanceScore: 0.95 }]
 * ```
 */
export async function validateAndEnrichCitations(
  supabase: SupabaseClient<Database>,
  citations: CitedPaper[],
  collectionId: string
): Promise<CitedPaper[]> {
  if (citations.length === 0) {
    return [];
  }

  try {
    // Extract unique paper IDs
    const paperIds = [...new Set(citations.map(c => c.paperId))];

    // Fetch papers from database
    const papers = await getPapersByIds(supabase, paperIds);

    // Verify papers belong to the collection
    const { data: collectionPapers, error } = await supabase
      .from('collection_papers')
      .select('paper_id')
      .eq('collection_id', collectionId)
      .in('paper_id', paperIds);

    if (error) {
      console.error(
        '[Citation Validator] Error fetching collection papers:',
        error
      );
      throw new Error(`Failed to validate citations: ${error.message}`);
    }

    const validPaperIds = new Set(collectionPapers.map(cp => cp.paper_id));

    // Create a map of paper IDs to paper data for quick lookup
    const paperMap = new Map(
      papers
        .filter(p => validPaperIds.has(p.paper_id))
        .map(p => [p.paper_id, p])
    );

    // Enrich and filter citations
    const enrichedCitations: CitedPaper[] = [];
    const invalidPaperIds: string[] = [];

    for (const citation of citations) {
      const paper = paperMap.get(citation.paperId);

      if (paper) {
        // Paper exists in collection - enrich with full metadata
        enrichedCitations.push({
          paperId: paper.paper_id,
          title: paper.title,
          relevanceScore: citation.relevanceScore,
          citedInContext: citation.citedInContext,
        });
      } else {
        // Paper doesn't exist in collection - possible hallucination
        invalidPaperIds.push(citation.paperId);
      }
    }

    // Log any invalid citations (hallucinations)
    if (invalidPaperIds.length > 0) {
      console.warn(
        `[Citation Validator] Filtered out ${invalidPaperIds.length} invalid citations:`,
        invalidPaperIds
      );
    }

    console.log(
      `[Citation Validator] Validated ${enrichedCitations.length}/${citations.length} citations`
    );

    return enrichedCitations;
  } catch (error) {
    console.error('[Citation Validator] Error validating citations:', error);
    throw error;
  }
}

/**
 * Check if a paper exists in a collection
 *
 * @param supabase - Supabase client
 * @param paperId - Paper ID to check
 * @param collectionId - Collection ID
 * @returns Promise resolving to true if paper exists in collection
 */
export async function isPaperInCollection(
  supabase: SupabaseClient<Database>,
  paperId: string,
  collectionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('collection_papers')
    .select('paper_id')
    .eq('collection_id', collectionId)
    .eq('paper_id', paperId)
    .single();

  if (error) {
    // PGRST116 error means no rows found
    if (error.code === 'PGRST116') {
      return false;
    }
    throw new Error(`Failed to check paper in collection: ${error.message}`);
  }

  return !!data;
}

/**
 * Get citation statistics for a set of paper IDs
 * Returns paper metadata with citation counts
 *
 * @param supabase - Supabase client
 * @param paperIds - Array of paper IDs
 * @returns Promise with paper metadata and citation counts
 */
export async function getCitationMetadata(
  supabase: SupabaseClient<Database>,
  paperIds: string[]
): Promise<
  Array<{
    paperId: string;
    title: string;
    authors: unknown;
    year: number | null;
    citationCount: number | null;
  }>
> {
  if (paperIds.length === 0) {
    return [];
  }

  const papers = await getPapersByIds(supabase, paperIds);

  return papers.map(p => ({
    paperId: p.paper_id,
    title: p.title,
    authors: p.authors,
    year: p.year,
    citationCount: p.citation_count,
  }));
}
