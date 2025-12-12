/**
 * Auto-Expand Preview API
 * POST /api/collections/[id]/auto-expand/preview - Get preview of papers to add via auto-expand
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { autoExpandPreviewSchema } from '@/lib/validations/auto-expand';
import { getCollectionWithOwnership } from '@/lib/db/collections';
import { getSemanticScholarClient } from '@/lib/semantic-scholar/client';
import { generateQueryEmbedding } from '@/lib/semantic-scholar/specter-client';
import { expandQueryForReranking } from '@/lib/gemini/query-expand';
import { cosineSimilarity } from '@/lib/utils/vector';
import type { Paper } from '@/lib/semantic-scholar/types';
import type { PaperPreview } from '@/lib/search/types';

const RATE_LIMIT_DELAY = 100; // ms between API calls

interface AutoExpandPaperPreview extends PaperPreview {
  degree: 1 | 2 | 3;
  sourcePaperId: string;
}

interface AutoExpandPreviewResponse {
  success: boolean;
  data: {
    papers: AutoExpandPaperPreview[];
    stats: {
      degree1Count: number;
      degree2Count: number;
      degree3Count: number;
      totalCount: number;
      papersWithEmbeddings: number;
      rerankingApplied: boolean;
    };
  };
}

/**
 * Sleep helper for rate limiting
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert Semantic Scholar paper to PaperPreview format
 */
function paperToPreview(
  paper: Paper,
  sourcePaperId: string,
  degree: 1 | 2 | 3,
  sourceType: 'reference' | 'citation'
): AutoExpandPaperPreview {
  return {
    paperId: paper.paperId,
    title: paper.title,
    authors: paper.authors || [],
    year: paper.year || null,
    abstract: paper.abstract || null,
    citationCount: paper.citationCount || null,
    venue: paper.venue || null,
    similarity: null, // Will be filled after embedding fetch
    hasEmbedding: false,
    isOpenAccess: !!paper.openAccessPdf?.url,
    sourceType,
    degree,
    sourcePaperId,
  };
}

/**
 * POST /api/collections/[id]/auto-expand/preview
 * Returns preview of papers that would be added by auto-expand
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const result = autoExpandPreviewSchema.safeParse(body);

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

    const {
      degree: targetDegree,
      type,
      influentialOnly,
      maxPapersPerNode,
    } = result.data;

    // 2. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Verify collection ownership and get search query
    const collection = await getCollectionWithOwnership(
      supabase,
      params.id,
      user.id
    );

    // Get the original search query for similarity comparison
    const originalQuery =
      collection.natural_language_query || collection.search_query || '';

    if (!originalQuery) {
      return NextResponse.json(
        { error: 'Collection has no search query for similarity comparison' },
        { status: 400 }
      );
    }

    // 4. Get existing papers with their degrees
    const { data: existingPapers, error: papersError } = await supabase
      .from('collection_papers')
      .select('paper_id, degree')
      .eq('collection_id', params.id);

    if (papersError) {
      throw new Error(
        `Failed to fetch existing papers: ${papersError.message}`
      );
    }

    const existingPaperIds = new Set(
      existingPapers?.map(p => p.paper_id) || []
    );
    const seenPaperIds = new Set(existingPaperIds); // Global dedup

    // 5. Group existing papers by degree
    const papersByDegree = new Map<number, string[]>();
    for (const p of existingPapers || []) {
      const deg = p.degree ?? 0;
      if (!papersByDegree.has(deg)) papersByDegree.set(deg, []);
      papersByDegree.get(deg)!.push(p.paper_id);
    }

    // 6. Initialize Semantic Scholar client
    const client = getSemanticScholarClient();

    // 7. Iteratively expand for each degree level
    const allDiscoveredPapers: AutoExpandPaperPreview[] = [];
    const stats = {
      degree1Count: 0,
      degree2Count: 0,
      degree3Count: 0,
      totalCount: 0,
      papersWithEmbeddings: 0,
      rerankingApplied: false,
    };

    console.log(
      `[AutoExpand] Starting auto-expand preview for collection ${params.id}`
    );
    console.log(
      `[AutoExpand] Parameters: degree=${targetDegree}, type=${type}, influentialOnly=${influentialOnly}, maxPapersPerNode=${maxPapersPerNode}`
    );

    for (
      let currentDegree = 1;
      currentDegree <= targetDegree;
      currentDegree++
    ) {
      const sourcePaperIds = papersByDegree.get(currentDegree - 1) || [];
      if (sourcePaperIds.length === 0) {
        console.log(
          `[AutoExpand] No source papers at degree ${currentDegree - 1}, stopping`
        );
        break;
      }

      console.log(
        `[AutoExpand] Expanding from ${sourcePaperIds.length} papers at degree ${currentDegree - 1} -> degree ${currentDegree}`
      );

      const degreeResults: AutoExpandPaperPreview[] = [];

      for (const sourcePaperId of sourcePaperIds) {
        // Fetch refs and/or citations based on type
        const papers: AutoExpandPaperPreview[] = [];

        if (type === 'references' || type === 'both') {
          const refs = await client.getAllReferences(sourcePaperId, {
            maxReferences: maxPapersPerNode,
            influentialOnly,
          });

          for (const ref of refs) {
            if (!ref.citedPaper?.paperId) continue;
            if (seenPaperIds.has(ref.citedPaper.paperId)) continue;
            seenPaperIds.add(ref.citedPaper.paperId);

            papers.push(
              paperToPreview(
                ref.citedPaper,
                sourcePaperId,
                currentDegree as 1 | 2 | 3,
                'reference'
              )
            );
          }

          await delay(RATE_LIMIT_DELAY);
        }

        if (type === 'citations' || type === 'both') {
          const cits = await client.getAllCitations(sourcePaperId, {
            maxCitations: maxPapersPerNode,
            influentialOnly,
          });

          for (const cit of cits) {
            if (!cit.citingPaper?.paperId) continue;
            if (seenPaperIds.has(cit.citingPaper.paperId)) continue;
            seenPaperIds.add(cit.citingPaper.paperId);

            papers.push(
              paperToPreview(
                cit.citingPaper,
                sourcePaperId,
                currentDegree as 1 | 2 | 3,
                'citation'
              )
            );
          }

          await delay(RATE_LIMIT_DELAY);
        }

        degreeResults.push(...papers);
      }

      // Note: We do NOT add discovered papers to papersByDegree
      // Only papers already in the DB (collection) are used as sources for expansion
      // This prevents exponential growth of API calls
      allDiscoveredPapers.push(...degreeResults);

      // Update stats
      if (currentDegree === 1) stats.degree1Count = degreeResults.length;
      if (currentDegree === 2) stats.degree2Count = degreeResults.length;
      if (currentDegree === 3) stats.degree3Count = degreeResults.length;

      console.log(
        `[AutoExpand] Found ${degreeResults.length} new papers at degree ${currentDegree}`
      );
    }

    stats.totalCount = allDiscoveredPapers.length;

    console.log(
      `[AutoExpand] Preview complete: ${allDiscoveredPapers.length} total papers`
    );

    // 8. Fetch embeddings and calculate similarity to original query
    if (allDiscoveredPapers.length > 0) {
      console.log(
        `[AutoExpand] Generating query embedding and fetching paper embeddings...`
      );

      // Expand query for better SPECTER embedding similarity
      const { expandedQuery } = await expandQueryForReranking(originalQuery);

      // Generate query embedding and fetch paper embeddings in parallel
      const paperIds = allDiscoveredPapers.map(p => p.paperId);

      const [queryEmbedding, papersWithEmbeddings] = await Promise.all([
        generateQueryEmbedding(expandedQuery),
        client.getPapersBatchParallel(paperIds, { includeEmbedding: true }),
      ]);

      if (queryEmbedding) {
        // Create a map of paperId -> embedding for quick lookup
        const embeddingMap = new Map<string, number[]>();
        for (const paper of papersWithEmbeddings) {
          if (paper?.paperId && paper.embedding?.vector) {
            embeddingMap.set(paper.paperId, paper.embedding.vector);
          }
        }

        stats.papersWithEmbeddings = embeddingMap.size;
        console.log(
          `[AutoExpand] Found ${embeddingMap.size}/${allDiscoveredPapers.length} papers with embeddings`
        );

        // Calculate similarity for each paper
        for (const paper of allDiscoveredPapers) {
          const paperEmbedding = embeddingMap.get(paper.paperId);
          if (paperEmbedding) {
            paper.similarity = cosineSimilarity(queryEmbedding, paperEmbedding);
            paper.hasEmbedding = true;
          }
        }

        // Sort by similarity (papers with embeddings first, by similarity desc)
        // Then papers without embeddings sorted by citation count
        allDiscoveredPapers.sort((a, b) => {
          // Both have similarity: sort by similarity desc
          if (a.similarity !== null && b.similarity !== null) {
            return b.similarity - a.similarity;
          }
          // Only a has similarity: a comes first
          if (a.similarity !== null) return -1;
          // Only b has similarity: b comes first
          if (b.similarity !== null) return 1;
          // Neither has similarity: sort by citation count desc
          return (b.citationCount || 0) - (a.citationCount || 0);
        });

        stats.rerankingApplied = true;
        console.log(`[AutoExpand] Re-ranking by similarity completed`);
      } else {
        console.warn(
          `[AutoExpand] Query embedding generation failed, using citation count order`
        );
        // Fallback: sort by citation count
        allDiscoveredPapers.sort(
          (a, b) => (b.citationCount || 0) - (a.citationCount || 0)
        );
      }
    }

    // 9. Return response
    const response: AutoExpandPreviewResponse = {
      success: true,
      data: {
        papers: allDiscoveredPapers,
        stats,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in auto-expand preview:', error);
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
        error: 'Failed to generate auto-expand preview',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
