/**
 * Database Operations for paper_chunks table
 *
 * CRUD operations for storing and managing chunked paper text with embeddings.
 *
 * Note: paper_chunks table stores chunks per paper (not per collection).
 * This prevents duplicate embeddings when the same paper is in multiple collections.
 */

import { createAdminSupabaseClient } from '@/lib/supabase/server';

export interface ChunkInsert {
  paperId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  embedding: number[];
}

export interface ChunkInsertWithFigureRefs extends ChunkInsert {
  referencedFigures: string[];
}

export interface InsertedChunkWithRefs {
  id: string;
  chunkIndex: number;
  referencedFigures: string[];
}

export interface StoredChunk {
  id: string;
  paperId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  createdAt: string;
}

/**
 * Insert chunks into the database
 *
 * Uses upsert to handle re-indexing of papers.
 * Chunks are stored per paper (not per collection) to prevent duplicates.
 *
 * @param chunks - Array of chunks to insert
 * @throws Error if insertion fails
 *
 * @example
 * ```typescript
 * await insertChunks([
 *   { paperId: 'abc123', content: '...', chunkIndex: 0, tokenCount: 100, embedding: [...] }
 * ]);
 * ```
 */
export async function insertChunks(chunks: ChunkInsert[]): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  const supabase = createAdminSupabaseClient();

  // Transform to database format
  const records = chunks.map(c => ({
    paper_id: c.paperId,
    content: c.content,
    chunk_index: c.chunkIndex,
    token_count: c.tokenCount,
    chunk_type: 'text',
    // pgvector expects array format - Supabase handles the conversion
    embedding: JSON.stringify(c.embedding),
  }));

  // Insert in batches of 100 to avoid request size limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    // Use type assertion since paper_chunks table is not in generated types yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('paper_chunks')
      .upsert(batch, {
        onConflict: 'paper_id,chunk_index,chunk_type',
      });

    if (error) {
      throw new Error(
        `Failed to insert chunks (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${error.message}`
      );
    }
  }

  console.log(`[Chunks DB] Inserted ${chunks.length} chunks`);
}

/**
 * Insert text chunks with figure references into the database
 *
 * Enhanced version of insertChunks that:
 * - Sets chunk_type to 'text'
 * - Stores referenced_figures array
 * - Returns inserted chunk IDs for use in figure processing
 *
 * @param chunks - Array of chunks with figure references to insert
 * @returns Array of inserted chunks with their IDs
 * @throws Error if insertion fails
 *
 * @example
 * ```typescript
 * const inserted = await insertChunksWithFigureRefs([
 *   { paperId: 'abc123', content: '...', chunkIndex: 0, tokenCount: 100, embedding: [...], referencedFigures: ['Figure 1'] }
 * ]);
 * // inserted = [{ id: 'chunk-uuid', chunkIndex: 0, referencedFigures: ['Figure 1'] }]
 * ```
 */
export async function insertChunksWithFigureRefs(
  chunks: ChunkInsertWithFigureRefs[]
): Promise<InsertedChunkWithRefs[]> {
  if (chunks.length === 0) {
    return [];
  }

  const supabase = createAdminSupabaseClient();

  // Transform to database format with figure references
  const records = chunks.map(c => ({
    paper_id: c.paperId,
    content: c.content,
    chunk_index: c.chunkIndex,
    token_count: c.tokenCount,
    chunk_type: 'text',
    referenced_figures: c.referencedFigures,
    // pgvector expects array format - Supabase handles the conversion
    embedding: JSON.stringify(c.embedding),
  }));

  const insertedChunks: InsertedChunkWithRefs[] = [];

  // Insert in batches of 100 to avoid request size limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const originalChunksBatch = chunks.slice(i, i + BATCH_SIZE);

    // Use type assertion since paper_chunks table types may not include new columns yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('paper_chunks')
      .upsert(batch, {
        onConflict: 'paper_id,chunk_index,chunk_type',
      })
      .select('id, chunk_index, referenced_figures');

    if (error) {
      throw new Error(
        `Failed to insert chunks with figure refs (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${error.message}`
      );
    }

    // Map returned data to our format
    if (data) {
      for (const row of data) {
        insertedChunks.push({
          id: row.id,
          chunkIndex: row.chunk_index,
          referencedFigures: row.referenced_figures || [],
        });
      }
    } else {
      // If no data returned (shouldn't happen with .select()), use original chunk info
      for (const chunk of originalChunksBatch) {
        insertedChunks.push({
          id: '', // Will be empty, but processing can still continue
          chunkIndex: chunk.chunkIndex,
          referencedFigures: chunk.referencedFigures,
        });
      }
    }
  }

  const withRefs = insertedChunks.filter(
    c => c.referencedFigures.length > 0
  ).length;
  console.log(
    `[Chunks DB] Inserted ${chunks.length} text chunks (${withRefs} with figure references)`
  );

  return insertedChunks;
}

/**
 * Delete all chunks for a specific paper
 *
 * @param paperId - Paper ID
 * @throws Error if deletion fails
 */
export async function deleteChunksForPaper(paperId: string): Promise<void> {
  const supabase = createAdminSupabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('paper_chunks')
    .delete()
    .eq('paper_id', paperId);

  if (error) {
    throw new Error(`Failed to delete chunks: ${error.message}`);
  }

  console.log(`[Chunks DB] Deleted chunks for paper ${paperId}`);
}

/**
 * Get chunk count for a collection (via collection_papers join)
 *
 * @param collectionId - Collection ID
 * @returns Number of chunks for papers in the collection
 */
export async function getChunkCountForCollection(
  collectionId: string
): Promise<number> {
  const supabase = createAdminSupabaseClient();

  // First get all paper IDs in the collection
  const { data: collectionPapers, error: cpError } = await supabase
    .from('collection_papers')
    .select('paper_id')
    .eq('collection_id', collectionId);

  if (cpError) {
    throw new Error(`Failed to get collection papers: ${cpError.message}`);
  }

  if (!collectionPapers || collectionPapers.length === 0) {
    return 0;
  }

  const paperIds = collectionPapers.map(cp => cp.paper_id);

  // Count chunks for these papers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('paper_chunks')
    .select('*', { count: 'exact', head: true })
    .in('paper_id', paperIds);

  if (error) {
    throw new Error(`Failed to count chunks: ${error.message}`);
  }

  return count || 0;
}

/**
 * Get chunk count for a paper
 *
 * @param paperId - Paper ID
 * @returns Number of chunks for the paper
 */
export async function getChunkCountForPaper(paperId: string): Promise<number> {
  const supabase = createAdminSupabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('paper_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('paper_id', paperId);

  if (error) {
    throw new Error(`Failed to count paper chunks: ${error.message}`);
  }

  return count || 0;
}

/**
 * Check if a paper has been indexed
 *
 * @param paperId - Paper ID
 * @returns true if paper has chunks
 */
export async function isPaperIndexed(paperId: string): Promise<boolean> {
  const count = await getChunkCountForPaper(paperId);
  return count > 0;
}

/**
 * Get all indexed paper IDs in a collection
 *
 * @param collectionId - Collection ID
 * @returns Array of unique paper IDs that have chunks
 */
export async function getIndexedPaperIds(
  collectionId: string
): Promise<string[]> {
  const supabase = createAdminSupabaseClient();

  // First get all paper IDs in the collection
  const { data: collectionPapers, error: cpError } = await supabase
    .from('collection_papers')
    .select('paper_id')
    .eq('collection_id', collectionId);

  if (cpError) {
    throw new Error(`Failed to get collection papers: ${cpError.message}`);
  }

  if (!collectionPapers || collectionPapers.length === 0) {
    return [];
  }

  const paperIds = collectionPapers.map(cp => cp.paper_id);

  // Check which of these papers have chunks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('paper_chunks')
    .select('paper_id')
    .in('paper_id', paperIds);

  if (error) {
    throw new Error(`Failed to get indexed papers: ${error.message}`);
  }

  // Get unique paper IDs
  const indexedPaperIds = (data || []).map(
    (row: { paper_id: string }) => row.paper_id
  );
  const uniqueIds: string[] = Array.from(new Set(indexedPaperIds));
  return uniqueIds;
}

/**
 * Get text chunks with figure references for a paper
 *
 * Used by the figure analysis worker to provide context during figure analysis.
 *
 * @param paperId - Paper ID
 * @returns Array of text chunks with figure references
 */
export async function getTextChunksWithFigureRefs(
  paperId: string
): Promise<{ id: string; chunkIndex: number; referencedFigures: string[] }[]> {
  const supabase = createAdminSupabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('paper_chunks')
    .select('id, chunk_index, referenced_figures')
    .eq('paper_id', paperId)
    .eq('chunk_type', 'text')
    .not('referenced_figures', 'is', null);

  if (error) {
    throw new Error(
      `Failed to get text chunks with figure refs: ${error.message}`
    );
  }

  return (data || []).map(
    (row: {
      id: string;
      chunk_index: number;
      referenced_figures: string[];
    }) => ({
      id: row.id,
      chunkIndex: row.chunk_index,
      referencedFigures: row.referenced_figures || [],
    })
  );
}
