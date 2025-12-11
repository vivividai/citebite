/**
 * Collection Expand Preview API
 * POST /api/collections/[id]/expand/preview - Preview related papers from references/citations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { expandPreviewSchema } from '@/lib/validations/expand';
import { getCollectionWithOwnership } from '@/lib/db/collections';
import { getSemanticScholarClient } from '@/lib/semantic-scholar/client';
import { generateQueryEmbedding } from '@/lib/semantic-scholar/specter-client';
import { expandQueryForReranking } from '@/lib/gemini/query-expand';
import { rerankBySimilarity } from '@/lib/utils/vector';
import type { Paper, Reference, Citation } from '@/lib/semantic-scholar/types';
import type { PaperPreview } from '@/lib/search/types';

/**
 * POST /api/collections/[id]/expand/preview
 * Preview related papers (references/citations) with similarity scoring
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const result = expandPreviewSchema.safeParse(body);

    if (!result.success) {
      console.error('Validation failed:', result.error);
      const errors = result.error.issues || [];

      return NextResponse.json(
        {
          error: 'Invalid input',
          details: errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const { paperId, type, influentialOnly, maxPapers } = result.data;

    // 2. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Verify collection ownership
    const collection = await getCollectionWithOwnership(
      supabase,
      params.id,
      user.id
    );

    // 4. Get existing papers in collection to filter out
    const { data: existingPapers } = await supabase
      .from('collection_papers')
      .select('paper_id')
      .eq('collection_id', params.id);

    const existingPaperIds = new Set(
      existingPapers?.map(p => p.paper_id) || []
    );

    // 5. Fetch references and/or citations from Semantic Scholar
    const client = getSemanticScholarClient();
    const relatedPapers: Paper[] = [];
    let referencesCount = 0;
    let citationsCount = 0;

    const halfMax = Math.floor(maxPapers / 2);

    if (type === 'references' || type === 'both') {
      const maxRefs = type === 'both' ? halfMax : maxPapers;
      const references = await client.getAllReferences(paperId, {
        maxReferences: maxRefs,
        influentialOnly,
      });

      // Extract papers from references, filtering out those without valid paperId
      const refPapers = references
        .map((r: Reference) => r.citedPaper)
        .filter((p: Paper) => p && p.paperId);

      relatedPapers.push(...refPapers);
      referencesCount = refPapers.length;
    }

    if (type === 'citations' || type === 'both') {
      const maxCits = type === 'both' ? halfMax : maxPapers;
      const citations = await client.getAllCitations(paperId, {
        maxCitations: maxCits,
        influentialOnly,
      });

      // Extract papers from citations, filtering out those without valid paperId
      const citPapers = citations
        .map((c: Citation) => c.citingPaper)
        .filter((p: Paper) => p && p.paperId);

      relatedPapers.push(...citPapers);
      citationsCount = citPapers.length;
    }

    // 6. Filter out papers already in collection and deduplicate
    const seenIds = new Set<string>();
    const uniqueNewPapers = relatedPapers.filter(paper => {
      if (!paper.paperId) return false;
      if (existingPaperIds.has(paper.paperId)) return false;
      if (seenIds.has(paper.paperId)) return false;
      seenIds.add(paper.paperId);
      return true;
    });

    console.log(
      `[ExpandPreview] Found ${relatedPapers.length} related papers, ${uniqueNewPapers.length} are new`
    );

    // 7. If no new papers found, return empty result
    if (uniqueNewPapers.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          papers: [],
          stats: {
            totalFound: relatedPapers.length,
            referencesCount,
            citationsCount,
            papersWithEmbeddings: 0,
            alreadyInCollection: existingPaperIds.size,
            rerankingApplied: false,
          },
          sourceQuery:
            collection.natural_language_query || collection.search_query || '',
        },
      });
    }

    // 8. Get collection's query for similarity calculation
    const sourceQuery =
      collection.natural_language_query || collection.search_query || '';

    // 9. Generate query embedding for similarity calculation
    let queryEmbedding: number[] | null = null;
    if (sourceQuery) {
      const { expandedQuery } = await expandQueryForReranking(sourceQuery);
      queryEmbedding = await generateQueryEmbedding(expandedQuery);
    }

    // 10. Fetch embeddings for related papers if we have query embedding
    let papersWithSimilarity: Array<Paper & { similarity?: number }> =
      uniqueNewPapers;
    let papersWithEmbeddings = 0;
    let rerankingApplied = false;

    if (queryEmbedding) {
      // Fetch embeddings via batch API
      const paperIds = uniqueNewPapers.map(p => p.paperId);
      const papersWithEmbeddingsData = await client.getPapersBatchParallel(
        paperIds,
        {
          includeEmbedding: true,
        }
      );

      // Create a map of paperId -> embedding
      const embeddingMap = new Map<string, Paper['embedding']>();
      for (const paper of papersWithEmbeddingsData) {
        if (paper && paper.paperId && paper.embedding?.vector) {
          embeddingMap.set(paper.paperId, paper.embedding);
        }
      }

      // Merge embeddings into original papers
      const papersWithMergedEmbeddings = uniqueNewPapers.map(paper => ({
        ...paper,
        embedding: embeddingMap.get(paper.paperId) || null,
      }));

      papersWithEmbeddings = embeddingMap.size;

      if (papersWithEmbeddings > 0) {
        // Re-rank by similarity
        const ranked = rerankBySimilarity(
          papersWithMergedEmbeddings,
          queryEmbedding,
          maxPapers
        );
        papersWithSimilarity = ranked;
        rerankingApplied = true;

        console.log(
          `[ExpandPreview] Re-ranked ${ranked.length} papers by similarity`
        );
      }
    }

    // 11. Transform to preview format
    const previewPapers: PaperPreview[] = papersWithSimilarity.map(paper => ({
      paperId: paper.paperId,
      title: paper.title,
      authors: paper.authors?.map(a => ({ name: a.name })) || [],
      year: paper.year ?? null,
      abstract: paper.abstract ?? null,
      citationCount: paper.citationCount ?? null,
      venue: paper.venue ?? null,
      similarity:
        'similarity' in paper ? ((paper.similarity as number) ?? null) : null,
      hasEmbedding: 'similarity' in paper && paper.similarity !== undefined,
      isOpenAccess: !!paper.openAccessPdf?.url,
    }));

    // 12. Return preview data
    return NextResponse.json({
      success: true,
      data: {
        papers: previewPapers,
        stats: {
          totalFound: relatedPapers.length,
          referencesCount,
          citationsCount,
          papersWithEmbeddings,
          alreadyInCollection: relatedPapers.length - uniqueNewPapers.length,
          rerankingApplied,
        },
        sourceQuery,
      },
    });
  } catch (error) {
    console.error('Error previewing expand:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('access denied')
    ) {
      return NextResponse.json(
        {
          error: 'Collection not found',
          message: errorMessage,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to preview expand',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
