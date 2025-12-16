/**
 * Collection Graph API
 * GET /api/collections/[id]/graph - Get graph data for visualization
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCollectionWithOwnership } from '@/lib/db/collections';
import type {
  GraphNode,
  GraphEdge,
  GraphData,
  RelationshipType,
} from '@/types/graph';

interface PaperAuthor {
  name: string;
  authorId?: string;
}

/**
 * GET /api/collections/[id]/graph
 * Returns graph data with nodes and edges for visualization
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // 2. Verify collection ownership
    await getCollectionWithOwnership(supabase, params.id, user.id);

    // 3. Query collection papers with paper details
    // Note: Using papers!collection_papers_paper_id_fkey hint to resolve ambiguity
    const { data: collectionPapers, error: papersError } = await supabase
      .from('collection_papers')
      .select(
        `
        paper_id,
        source_paper_id,
        relationship_type,
        similarity_score,
        degree,
        papers!collection_papers_paper_id_fkey (
          paper_id,
          title,
          authors,
          year,
          citation_count,
          venue,
          text_vector_status,
          abstract
        )
      `
      )
      .eq('collection_id', params.id);

    if (papersError) {
      throw new Error(`Failed to fetch papers: ${papersError.message}`);
    }

    // 4. Transform to graph data
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const paperIds = new Set<string>();

    for (const cp of collectionPapers || []) {
      const paper = cp.papers as unknown as {
        paper_id: string;
        title: string;
        authors: PaperAuthor[] | null;
        year: number | null;
        citation_count: number | null;
        venue: string | null;
        text_vector_status: string | null;
        abstract: string | null;
      } | null;

      if (!paper) continue;

      // Add node
      paperIds.add(paper.paper_id);

      const authorsString = paper.authors
        ? paper.authors.map((a: PaperAuthor) => a.name).join(', ')
        : '';

      nodes.push({
        id: paper.paper_id,
        title: paper.title,
        authors: authorsString,
        year: paper.year,
        citationCount: paper.citation_count,
        venue: paper.venue,
        vectorStatus: paper.text_vector_status as
          | 'pending'
          | 'completed'
          | 'failed'
          | null,
        relationshipType:
          (cp.relationship_type as RelationshipType) || 'search',
        similarity: cp.similarity_score,
        abstract: paper.abstract,
        sourcePaperId: cp.source_paper_id,
        degree: cp.degree ?? 0,
      });

      // Add edge if this paper was expanded from another
      if (
        cp.source_paper_id &&
        (cp.relationship_type === 'reference' ||
          cp.relationship_type === 'citation')
      ) {
        edges.push({
          source: cp.source_paper_id,
          target: paper.paper_id,
          relationshipType: cp.relationship_type as 'reference' | 'citation',
        });
      }
    }

    const graphData: GraphData = {
      nodes,
      edges,
    };

    return NextResponse.json({
      success: true,
      data: graphData,
    });
  } catch (error) {
    console.error('Error fetching graph data:', error);
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
        error: 'Failed to fetch graph data',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
