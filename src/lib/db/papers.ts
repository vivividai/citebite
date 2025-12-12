import { SupabaseClient } from '@supabase/supabase-js';
import { Database, TablesInsert } from '@/types/database.types';
import type { Paper as SemanticScholarPaper } from '@/lib/semantic-scholar/types';

type PaperInsert = TablesInsert<'papers'>;

/**
 * Convert Semantic Scholar paper to database paper insert format
 */
export function semanticScholarPaperToDbPaper(
  paper: SemanticScholarPaper
): PaperInsert {
  const hasOpenAccessPdf = !!paper.openAccessPdf?.url;

  return {
    paper_id: paper.paperId,
    title: paper.title,
    abstract: paper.abstract || null,
    authors:
      paper.authors as unknown as Database['public']['Tables']['papers']['Insert']['authors'],
    year: paper.year || null,
    citation_count: paper.citationCount || null,
    venue: paper.venue || null,
    open_access_pdf_url: paper.openAccessPdf?.url || null,
    pdf_source: 'auto',
    vector_status: hasOpenAccessPdf ? 'pending' : 'failed',
  };
}

/**
 * Upsert papers to database (insert or update if exists)
 * Returns the paper IDs that were successfully upserted
 */
export async function upsertPapers(
  supabase: SupabaseClient<Database>,
  papers: PaperInsert[]
): Promise<string[]> {
  if (papers.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('papers')
    .upsert(papers, {
      onConflict: 'paper_id',
      ignoreDuplicates: false, // Update existing papers with new data
    })
    .select('paper_id');

  if (error) {
    throw new Error(`Failed to upsert papers: ${error.message}`);
  }

  return data.map(p => p.paper_id);
}

/**
 * Get papers by IDs
 */
export async function getPapersByIds(
  supabase: SupabaseClient<Database>,
  paperIds: string[]
) {
  if (paperIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('papers')
    .select('*')
    .in('paper_id', paperIds);

  if (error) {
    throw new Error(`Failed to fetch papers: ${error.message}`);
  }

  return data;
}

/**
 * Get Open Access papers from a list of papers
 * Returns papers that have a valid openAccessPdf URL
 */
export function getOpenAccessPapers(
  papers: SemanticScholarPaper[]
): SemanticScholarPaper[] {
  return papers.filter(paper => paper.openAccessPdf?.url);
}

/**
 * Get papers for a specific collection
 */
export async function getCollectionPapers(
  supabase: SupabaseClient<Database>,
  collectionId: string
) {
  // Use FK hint to resolve ambiguity with source_paper_id relationship
  const { data, error } = await supabase
    .from('collection_papers')
    .select(
      `
      paper_id,
      degree,
      papers!collection_papers_paper_id_fkey (
        paper_id,
        title,
        authors,
        year,
        abstract,
        citation_count,
        venue,
        open_access_pdf_url,
        pdf_source,
        vector_status,
        created_at
      )
    `
    )
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to fetch collection papers: ${error.message}`);
  }

  // Transform to return papers with degree from collection_papers
  return data
    .filter(item => item.papers !== null)
    .map(item => ({
      ...item.papers,
      degree: item.degree ?? 0,
    }));
}
