/**
 * Database Operations for paper_chunks table
 *
 * CRUD operations for storing and managing chunked paper text with embeddings.
 *
 * Note: paper_chunks table is created by the pgvector migration.
 * TypeScript types will be available after running `npx supabase gen types`.
 * Until then, we use raw SQL via supabase.rpc() for type safety.
 */

import { createAdminSupabaseClient } from '@/lib/supabase/server';

export interface ChunkInsert {
  paperId: string;
  collectionId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  embedding: number[];
}

export interface StoredChunk {
  id: string;
  paperId: string;
  collectionId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  createdAt: string;
}

/**
 * Insert chunks into the database
 *
 * Uses upsert to handle re-indexing of papers.
 *
 * @param chunks - Array of chunks to insert
 * @throws Error if insertion fails
 *
 * @example
 * ```typescript
 * await insertChunks([
 *   { paperId: 'abc123', collectionId: 'uuid', content: '...', chunkIndex: 0, tokenCount: 100, embedding: [...] }
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
    collection_id: c.collectionId,
    content: c.content,
    chunk_index: c.chunkIndex,
    token_count: c.tokenCount,
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
        onConflict: 'paper_id,collection_id,chunk_index',
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
 * Delete all chunks for a specific paper in a collection
 *
 * @param paperId - Paper ID
 * @param collectionId - Collection ID
 * @throws Error if deletion fails
 */
export async function deleteChunksForPaper(
  paperId: string,
  collectionId: string
): Promise<void> {
  const supabase = createAdminSupabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('paper_chunks')
    .delete()
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to delete chunks: ${error.message}`);
  }

  console.log(
    `[Chunks DB] Deleted chunks for paper ${paperId} in collection ${collectionId}`
  );
}

/**
 * Delete all chunks for a collection
 *
 * @param collectionId - Collection ID
 * @throws Error if deletion fails
 */
export async function deleteChunksForCollection(
  collectionId: string
): Promise<void> {
  const supabase = createAdminSupabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('paper_chunks')
    .delete()
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to delete collection chunks: ${error.message}`);
  }

  console.log(`[Chunks DB] Deleted all chunks for collection ${collectionId}`);
}

/**
 * Get chunk count for a collection
 *
 * @param collectionId - Collection ID
 * @returns Number of chunks in the collection
 */
export async function getChunkCountForCollection(
  collectionId: string
): Promise<number> {
  const supabase = createAdminSupabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('paper_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to count chunks: ${error.message}`);
  }

  return count || 0;
}

/**
 * Get chunk count for a paper in a collection
 *
 * @param paperId - Paper ID
 * @param collectionId - Collection ID
 * @returns Number of chunks for the paper
 */
export async function getChunkCountForPaper(
  paperId: string,
  collectionId: string
): Promise<number> {
  const supabase = createAdminSupabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('paper_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to count paper chunks: ${error.message}`);
  }

  return count || 0;
}

/**
 * Check if a paper has been indexed in a collection
 *
 * @param paperId - Paper ID
 * @param collectionId - Collection ID
 * @returns true if paper has chunks in the collection
 */
export async function isPaperIndexed(
  paperId: string,
  collectionId: string
): Promise<boolean> {
  const count = await getChunkCountForPaper(paperId, collectionId);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('paper_chunks')
    .select('paper_id')
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to get indexed papers: ${error.message}`);
  }

  // Get unique paper IDs
  const paperIds = (data || []).map(
    (row: { paper_id: string }) => row.paper_id
  );
  const uniqueIds: string[] = Array.from(new Set(paperIds));
  return uniqueIds;
}
