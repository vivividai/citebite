/**
 * QASPER Paper Ingestion
 *
 * Downloads papers from ArXiv and queues them for indexing
 * using the existing CiteBite pipeline.
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';
import { queuePdfDownload } from '@/lib/jobs/queues';
import { QasperPaper, IngestionResult } from './types';

/**
 * Create admin Supabase client for scripts
 * (Doesn't use Next.js cookies)
 */
function createScriptSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey);
}

/**
 * Get ArXiv PDF URL from paper ID
 * QASPER paper IDs are ArXiv IDs (e.g., "1909.00694")
 */
export function getArxivPdfUrl(paperId: string): string {
  return `https://arxiv.org/pdf/${paperId}.pdf`;
}

/**
 * Create or get existing evaluation collection
 */
export async function getOrCreateEvalCollection(
  collectionName: string = 'QASPER Evaluation'
): Promise<string> {
  const supabase = createScriptSupabaseClient();

  // Check if collection already exists
  const { data: existing } = await supabase
    .from('collections')
    .select('id')
    .eq('name', collectionName)
    .single();

  if (existing) {
    console.log(`Using existing collection: ${existing.id}`);
    return existing.id;
  }

  // Create new collection with a system user ID
  // For evaluation, we use a fixed UUID as the "eval user"
  const EVAL_USER_ID = '00000000-0000-0000-0000-000000000001';

  // First, ensure the eval user exists
  const { error: userError } = await supabase.from('profiles').upsert(
    {
      id: EVAL_USER_ID,
      email: 'eval@citebite.local',
      display_name: 'QASPER Evaluator',
    },
    { onConflict: 'id' }
  );

  if (userError) {
    console.warn('Could not create eval user profile:', userError.message);
    // Continue anyway - the user might exist already
  }

  const { data: collection, error } = await supabase
    .from('collections')
    .insert({
      name: collectionName,
      user_id: EVAL_USER_ID,
      search_query: 'QASPER evaluation dataset',
      use_ai_assistant: false,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create collection: ${error.message}`);
  }

  console.log(`Created new collection: ${collection.id}`);
  return collection.id;
}

/**
 * Ingest QASPER papers into the CiteBite system
 *
 * Process:
 * 1. Create papers in the database
 * 2. Link papers to the collection
 * 3. Queue PDF downloads (workers handle download + indexing)
 *
 * @param papers - QASPER papers to ingest
 * @param collectionId - Target collection ID
 * @param onProgress - Progress callback
 * @returns Ingestion results
 */
export async function ingestQasperPapers(
  papers: QasperPaper[],
  collectionId: string,
  onProgress?: (current: number, total: number) => void
): Promise<IngestionResult> {
  const supabase = createScriptSupabaseClient();

  const result: IngestionResult = {
    queued: 0,
    failed: [],
    paperIdMap: new Map(),
  };

  const total = papers.length;

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const arxivId = paper.id;
    const pdfUrl = getArxivPdfUrl(arxivId);

    try {
      // Use arxiv ID as paper_id for consistency
      const paperId = `arxiv:${arxivId}`;

      // 1. Upsert paper
      const { error: paperError } = await supabase.from('papers').upsert(
        {
          paper_id: paperId,
          title: paper.title,
          abstract: paper.abstract,
          authors: [], // QASPER doesn't include author info in a structured format
          year: null,
          open_access_pdf_url: pdfUrl,
          pdf_source: 'auto',
          vector_status: 'pending',
        },
        { onConflict: 'paper_id' }
      );

      if (paperError) {
        console.error(`Failed to upsert paper ${arxivId}:`, paperError.message);
        result.failed.push(arxivId);
        continue;
      }

      // 2. Link to collection (ignore if already linked)
      const { error: linkError } = await supabase
        .from('collection_papers')
        .upsert(
          {
            collection_id: collectionId,
            paper_id: paperId,
          },
          { onConflict: 'collection_id,paper_id', ignoreDuplicates: true }
        );

      if (linkError) {
        console.error(
          `Failed to link paper ${arxivId} to collection:`,
          linkError.message
        );
        result.failed.push(arxivId);
        continue;
      }

      // 3. Check if paper is already indexed
      const { data: existingPaper } = await supabase
        .from('papers')
        .select('vector_status')
        .eq('paper_id', paperId)
        .single();

      if (existingPaper?.vector_status === 'completed') {
        // Already indexed, skip queueing
        result.paperIdMap.set(arxivId, paperId);
        continue;
      }

      // 4. Queue PDF download
      const jobId = await queuePdfDownload({
        collectionId,
        paperId,
        pdfUrl,
      });

      if (!jobId) {
        console.error(`Failed to queue PDF download for ${arxivId}`);
        result.failed.push(arxivId);
        continue;
      }

      result.queued++;
      result.paperIdMap.set(arxivId, paperId);
    } catch (error) {
      console.error(`Error processing paper ${arxivId}:`, error);
      result.failed.push(arxivId);
    }

    onProgress?.(i + 1, total);
  }

  return result;
}

/**
 * Get papers that need indexing for a collection
 */
export async function getPendingPapers(
  collectionId: string
): Promise<string[]> {
  const supabase = createScriptSupabaseClient();

  const { data, error } = await supabase
    .from('collection_papers')
    .select('paper_id, papers!inner(vector_status)')
    .eq('collection_id', collectionId)
    .in('papers.vector_status', ['pending', 'processing']);

  if (error) {
    throw new Error(`Failed to get pending papers: ${error.message}`);
  }

  return data.map(item => item.paper_id);
}
