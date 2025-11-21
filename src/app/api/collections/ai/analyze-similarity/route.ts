/**
 * API Route: POST /api/collections/ai/analyze-similarity
 *
 * Analyze similarity distribution for hybrid search query
 * Returns histogram and statistics to help users choose optimal threshold
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSemanticScholarClient } from '@/lib/semantic-scholar/client';
import { getSpecterClient } from '@/lib/semantic-scholar/specter-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Request validation schema
 */
const analyzeSimilaritySchema = z.object({
  keywords: z.string().min(1, 'Keywords are required').trim(),
  candidateLimit: z.number().int().min(100).max(2000).default(1000),
  yearFrom: z.number().int().min(1900).optional(),
  yearTo: z.number().int().max(new Date().getFullYear()).optional(),
  minCitations: z.number().int().min(0).optional(),
  openAccessOnly: z.boolean().optional(),
});

type AnalyzeSimilarityRequest = z.infer<typeof analyzeSimilaritySchema>;

interface SimilarityBucket {
  range: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

interface SimilarityStatistics {
  total: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number; // 25th percentile
  p75: number; // 75th percentile
  p90: number; // 90th percentile
  p95: number; // 95th percentile
}

interface SimilarityAnalysisResponse {
  success: true;
  data: {
    statistics: SimilarityStatistics;
    histogram: SimilarityBucket[];
    recommendations: {
      conservative: number; // High precision, fewer results
      balanced: number; // Balanced precision/recall
      inclusive: number; // High recall, more results
    };
  };
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Generate histogram buckets
 */
function generateHistogram(similarities: number[], bucketCount = 20): SimilarityBucket[] {
  const min = Math.min(...similarities);
  const max = Math.max(...similarities);
  const bucketSize = (max - min) / bucketCount;

  const buckets: SimilarityBucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const bucketMin = min + i * bucketSize;
    const bucketMax = min + (i + 1) * bucketSize;

    const count = similarities.filter(s => s >= bucketMin && s < bucketMax).length;

    buckets.push({
      range: `${bucketMin.toFixed(3)}-${bucketMax.toFixed(3)}`,
      min: bucketMin,
      max: bucketMax,
      count,
      percentage: (count / similarities.length) * 100,
    });
  }

  return buckets;
}

/**
 * POST /api/collections/ai/analyze-similarity
 *
 * Analyze similarity distribution for a search query
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const result = analyzeSimilaritySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { keywords, candidateLimit, yearFrom, yearTo, minCitations, openAccessOnly } =
      result.data;

    console.log('[API:AnalyzeSimilarity] Starting similarity analysis');
    console.log(`[API:AnalyzeSimilarity] Keywords: "${keywords}"`);
    console.log(`[API:AnalyzeSimilarity] Candidate limit: ${candidateLimit}`);

    // 3. Fetch candidate papers
    const semanticScholarClient = getSemanticScholarClient();

    const searchResponse = await semanticScholarClient.searchPapers({
      keywords,
      limit: candidateLimit,
      yearFrom,
      yearTo,
      minCitations,
      openAccessOnly,
    });

    const candidates = searchResponse.data;
    console.log(`[API:AnalyzeSimilarity] Found ${candidates.length} candidate papers`);

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error: 'No papers found matching your criteria. Try different keywords or adjust filters.',
        },
        { status: 404 }
      );
    }

    // 4. Generate query embedding
    const specterClient = getSpecterClient();

    let queryEmbedding: number[];
    try {
      queryEmbedding = await specterClient.embedQuery(keywords);
      console.log('[API:AnalyzeSimilarity] Query embedding generated successfully');
    } catch (error) {
      console.error('[API:AnalyzeSimilarity] Failed to generate query embedding:', error);
      return NextResponse.json(
        {
          error: 'Failed to generate query embedding for semantic search',
        },
        { status: 500 }
      );
    }

    // 5. Fetch paper embeddings
    const paperIds = candidates.map(p => p.paperId);
    const embeddingResult = await specterClient.getPaperEmbeddings(paperIds);

    console.log(
      `[API:AnalyzeSimilarity] Embeddings fetched: ${embeddingResult.successful.size} successful, ${embeddingResult.failed.length} failed`
    );

    if (embeddingResult.successful.size === 0) {
      return NextResponse.json(
        {
          error: 'Failed to fetch paper embeddings for semantic search',
        },
        { status: 500 }
      );
    }

    // 6. Compute all similarities
    const similarities: number[] = [];

    for (const paper of candidates) {
      const paperEmbedding = embeddingResult.successful.get(paper.paperId);
      if (!paperEmbedding) continue;

      try {
        const similarity = specterClient.cosineSimilarity(queryEmbedding, paperEmbedding);
        similarities.push(similarity);
      } catch (error) {
        console.warn(
          `[API:AnalyzeSimilarity] Failed to compute similarity for ${paper.paperId}:`,
          error
        );
      }
    }

    console.log(`[API:AnalyzeSimilarity] Computed ${similarities.length} similarity scores`);

    // 7. Calculate statistics
    const sorted = [...similarities].sort((a, b) => a - b);

    const statistics: SimilarityStatistics = {
      total: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sorted.reduce((sum, s) => sum + s, 0) / sorted.length,
      median: percentile(sorted, 50),
      p25: percentile(sorted, 25),
      p75: percentile(sorted, 75),
      p90: percentile(sorted, 90),
      p95: percentile(sorted, 95),
    };

    // 8. Generate histogram
    const histogram = generateHistogram(similarities, 20);

    // 9. Provide threshold recommendations
    const recommendations = {
      conservative: Math.max(0.8, statistics.p75), // High precision: top 25%
      balanced: Math.max(0.7, statistics.median), // Balanced: top 50%
      inclusive: Math.max(0.6, statistics.p25), // High recall: top 75%
    };

    console.log('[API:AnalyzeSimilarity] Analysis complete');
    console.log(`[API:AnalyzeSimilarity] Statistics:`, statistics);
    console.log(`[API:AnalyzeSimilarity] Recommendations:`, recommendations);

    const response: SimilarityAnalysisResponse = {
      success: true,
      data: {
        statistics,
        histogram,
        recommendations,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[API:AnalyzeSimilarity] Error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to analyze similarity distribution';

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
