import { NextRequest, NextResponse } from 'next/server';
import { getSemanticScholarClient } from '@/lib/semantic-scholar/client';
import type { SearchParams } from '@/lib/semantic-scholar/types';

/**
 * Test API endpoint for Semantic Scholar integration
 * Usage: GET /api/test/semantic-scholar?keywords=machine+learning&limit=5
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Extract query parameters
    const keywords = searchParams.get('keywords') || 'machine learning';
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const yearFrom = searchParams.get('yearFrom')
      ? parseInt(searchParams.get('yearFrom')!, 10)
      : undefined;
    const yearTo = searchParams.get('yearTo')
      ? parseInt(searchParams.get('yearTo')!, 10)
      : undefined;
    const minCitations = searchParams.get('minCitations')
      ? parseInt(searchParams.get('minCitations')!, 10)
      : undefined;
    const openAccessOnly = searchParams.get('openAccessOnly') === 'true';

    // Build search parameters
    const params: SearchParams = {
      keywords,
      limit,
      yearFrom,
      yearTo,
      minCitations,
      openAccessOnly,
    };

    // Get Semantic Scholar client
    const client = getSemanticScholarClient();

    // Search for papers
    const startTime = Date.now();
    const response = await client.searchPapers(params);
    const duration = Date.now() - startTime;

    // Return results
    return NextResponse.json({
      success: true,
      query: params,
      duration: `${duration}ms`,
      total: response.total,
      offset: response.offset,
      next: response.next,
      count: response.data.length,
      papers: response.data.map(paper => ({
        paperId: paper.paperId,
        title: paper.title,
        authors: paper.authors.map(a => a.name).join(', '),
        year: paper.year,
        citationCount: paper.citationCount,
        venue: paper.venue,
        hasOpenAccessPdf: !!paper.openAccessPdf,
        pdfUrl: paper.openAccessPdf?.url,
        abstract: paper.abstract?.substring(0, 200) + '...', // First 200 chars
      })),
    });
  } catch (error: unknown) {
    console.error('Semantic Scholar API error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStatus =
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response
        ? (error.response.status as number)
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        status: errorStatus,
      },
      { status: errorStatus }
    );
  }
}
