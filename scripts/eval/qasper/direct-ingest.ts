/**
 * Direct Text Ingestion from QASPER JSON
 *
 * Bypasses PDF download and uses the full_text directly from QASPER dataset.
 * This is faster and more reliable for LLM response evaluation.
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';
import { QasperPaper, IngestionResult } from './types';
import { chunkText } from '@/lib/rag/chunker';
import { generateDocumentEmbeddings } from '@/lib/rag/embeddings';

/**
 * Create admin Supabase client for scripts
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
 * Extract full text from QASPER paper structure
 */
function extractFullText(paper: QasperPaper): string {
  const parts: string[] = [];

  // Add title
  parts.push(`# ${paper.title}\n`);

  // Add abstract
  if (paper.abstract) {
    parts.push(`## Abstract\n${paper.abstract}\n`);
  }

  // Add full text sections
  for (const section of paper.full_text) {
    if (section.section_name) {
      parts.push(`## ${section.section_name}\n`);
    }
    for (const paragraph of section.paragraphs) {
      parts.push(paragraph);
    }
  }

  return parts.join('\n\n');
}

/**
 * Create or get existing evaluation collection
 */
export async function getOrCreateDirectEvalCollection(
  collectionName: string = 'QASPER Evaluation (Direct)'
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
  const EVAL_USER_ID = '00000000-0000-0000-0000-000000000001';

  // Ensure the eval user exists
  await supabase.from('profiles').upsert(
    {
      id: EVAL_USER_ID,
      email: 'eval@citebite.local',
      display_name: 'QASPER Evaluator',
    },
    { onConflict: 'id' }
  );

  const { data: collection, error } = await supabase
    .from('collections')
    .insert({
      name: collectionName,
      user_id: EVAL_USER_ID,
      search_query: 'QASPER evaluation dataset (direct text)',
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
 * Ingest QASPER papers directly from JSON text
 *
 * Process:
 * 1. Extract full text from QASPER paper structure
 * 2. Chunk the text
 * 3. Generate embeddings
 * 4. Store in paper_chunks table
 *
 * @param papers - QASPER papers to ingest
 * @param collectionId - Target collection ID
 * @param onProgress - Progress callback
 * @returns Ingestion results
 */
export async function ingestQasperPapersDirect(
  papers: QasperPaper[],
  collectionId: string,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<IngestionResult> {
  const supabase = createScriptSupabaseClient();

  const result: IngestionResult = {
    queued: 0, // Not used in direct mode, but kept for compatibility
    failed: [],
    paperIdMap: new Map(),
  };

  const total = papers.length;

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const arxivId = paper.id;
    const paperId = `arxiv:${arxivId}`;

    onProgress?.(i + 1, total, `Processing ${arxivId}`);

    try {
      // 1. Extract full text
      const fullText = extractFullText(paper);

      if (!fullText || fullText.length < 100) {
        console.warn(`Paper ${arxivId} has insufficient text, skipping`);
        result.failed.push(arxivId);
        continue;
      }

      // 2. Upsert paper record
      const { error: paperError } = await supabase.from('papers').upsert(
        {
          paper_id: paperId,
          title: paper.title,
          abstract: paper.abstract,
          authors: [],
          year: null,
          open_access_pdf_url: `https://arxiv.org/pdf/${arxivId}.pdf`,
          pdf_source: 'auto',
          vector_status: 'processing',
        },
        { onConflict: 'paper_id' }
      );

      if (paperError) {
        console.error(`Failed to upsert paper ${arxivId}:`, paperError.message);
        result.failed.push(arxivId);
        continue;
      }

      // 3. Link to collection
      await supabase.from('collection_papers').upsert(
        {
          collection_id: collectionId,
          paper_id: paperId,
        },
        { onConflict: 'collection_id,paper_id', ignoreDuplicates: true }
      );

      // 4. Chunk the text
      onProgress?.(i + 1, total, `Chunking ${arxivId}`);
      const chunks = chunkText(fullText);

      if (chunks.length === 0) {
        console.warn(`No chunks generated for ${arxivId}`);
        result.failed.push(arxivId);
        continue;
      }

      // Extract content strings for embedding
      const chunkContents = chunks.map(c => c.content);

      // 5. Generate embeddings
      onProgress?.(
        i + 1,
        total,
        `Embedding ${arxivId} (${chunks.length} chunks)`
      );
      const embeddings = await generateDocumentEmbeddings(chunkContents);

      // 6. Store chunks with embeddings
      onProgress?.(i + 1, total, `Storing ${arxivId}`);
      const chunkRecords = chunks.map((chunk, idx) => ({
        paper_id: paperId,
        collection_id: collectionId,
        content: chunk.content,
        chunk_index: chunk.chunkIndex,
        token_count: chunk.tokenCount,
        embedding: JSON.stringify(embeddings[idx]),
      }));

      // Insert in batches of 100
      const BATCH_SIZE = 100;
      for (let j = 0; j < chunkRecords.length; j += BATCH_SIZE) {
        const batch = chunkRecords.slice(j, j + BATCH_SIZE);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: chunkError } = await (supabase as any)
          .from('paper_chunks')
          .upsert(batch, {
            onConflict: 'paper_id,collection_id,chunk_index',
          });

        if (chunkError) {
          throw new Error(`Failed to insert chunks: ${chunkError.message}`);
        }
      }

      // 7. Update paper status
      await supabase
        .from('papers')
        .update({ vector_status: 'completed' })
        .eq('paper_id', paperId);

      result.paperIdMap.set(arxivId, paperId);
    } catch (error) {
      console.error(`Error processing paper ${arxivId}:`, error);
      result.failed.push(arxivId);

      // Mark as failed
      await supabase
        .from('papers')
        .update({ vector_status: 'failed' })
        .eq('paper_id', `arxiv:${arxivId}`);
    }
  }

  return result;
}

/**
 * Check if papers are already indexed in a collection
 */
export async function getIndexedPaperCount(
  collectionId: string
): Promise<{ total: number; completed: number; failed: number }> {
  const supabase = createScriptSupabaseClient();

  const { data, error } = await supabase
    .from('collection_papers')
    .select('paper_id, papers!inner(vector_status)')
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to get indexed papers: ${error.message}`);
  }

  let completed = 0;
  let failed = 0;

  for (const item of data) {
    const status = (item.papers as unknown as { vector_status: string })
      .vector_status;
    if (status === 'completed') completed++;
    else if (status === 'failed') failed++;
  }

  return {
    total: data.length,
    completed,
    failed,
  };
}
