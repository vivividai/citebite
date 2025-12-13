/**
 * Figure Indexer
 *
 * Handles storing figure chunks in the database with embeddings.
 * Creates searchable entries for figures detected in PDFs.
 */

import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { generateDocumentEmbeddings } from './embeddings';
import { uploadFigureImage } from '@/lib/storage/supabaseStorage';
import { FigureAnalysis } from '@/lib/pdf/figure-analyzer';

export interface FigureChunkInput {
  paperId: string;
  collectionId: string;
  figureNumber: string;
  normalizedFigureNumber: string;
  caption: string;
  description: string;
  imageBuffer: Buffer;
  pageNumber: number;
  type: 'chart' | 'diagram' | 'image' | 'table' | 'other';
  mentionedInChunkIds: string[];
}

export interface IndexedFigure {
  chunkId: string;
  figureNumber: string;
  storagePath: string;
}

/**
 * Index figures into the database
 *
 * This uploads figure images to storage and creates searchable chunks
 * in the paper_chunks table with embeddings.
 *
 * @param figures - Array of figure data to index
 * @returns Number of figures indexed
 *
 * @example
 * ```typescript
 * const count = await indexFigures([
 *   { paperId: 'paper123', collectionId: 'col456', figureNumber: 'Figure 1', ... }
 * ]);
 * console.log(`Indexed ${count} figures`);
 * ```
 */
export async function indexFigures(
  figures: FigureChunkInput[]
): Promise<IndexedFigure[]> {
  if (figures.length === 0) return [];

  const supabase = createAdminSupabaseClient();
  const indexedFigures: IndexedFigure[] = [];

  // 1. Upload images to storage
  console.log(`[Figure Indexer] Uploading ${figures.length} figure images...`);
  const storagePaths: string[] = [];

  for (const fig of figures) {
    try {
      const path = await uploadFigureImage(
        fig.imageBuffer,
        fig.paperId,
        fig.normalizedFigureNumber
      );
      storagePaths.push(path);
    } catch (error) {
      console.error(
        `Failed to upload ${fig.figureNumber} for paper ${fig.paperId}:`,
        error
      );
      storagePaths.push(''); // Empty path for failed uploads
    }
  }

  // 2. Build searchable content for each figure
  const contents = figures.map(fig =>
    buildFigureContent(fig.normalizedFigureNumber, fig.caption, fig.description)
  );

  // 3. Generate embeddings
  console.log(
    `[Figure Indexer] Generating embeddings for ${figures.length} figures...`
  );
  const embeddings = await generateDocumentEmbeddings(contents);

  // 4. Insert into database
  console.log(`[Figure Indexer] Inserting figure chunks into database...`);

  // Get max chunk_index for each paper to continue numbering
  // Figure chunks start at 10000 to avoid collision with text chunks
  const FIGURE_INDEX_OFFSET = 10000;

  const records = figures.map((fig, i) => ({
    paper_id: fig.paperId,
    collection_id: fig.collectionId,
    chunk_type: 'figure',
    content: contents[i],
    chunk_index: FIGURE_INDEX_OFFSET + i,
    token_count: Math.ceil(contents[i].length / 4),
    figure_number: fig.normalizedFigureNumber,
    figure_caption: fig.caption,
    figure_description: fig.description,
    image_storage_path: storagePaths[i] || null,
    page_number: fig.pageNumber,
    mentioned_in_chunk_ids: fig.mentionedInChunkIds,
    embedding: JSON.stringify(embeddings[i]), // pgvector expects string format
  }));

  // Insert with upsert to handle re-indexing
  const { data, error } = await supabase
    .from('paper_chunks')
    .upsert(records, {
      onConflict: 'paper_id,collection_id,chunk_index',
      ignoreDuplicates: false,
    })
    .select('id, figure_number, image_storage_path');

  if (error) {
    throw new Error(`Failed to index figures: ${error.message}`);
  }

  // Build result
  for (const row of data || []) {
    indexedFigures.push({
      chunkId: row.id,
      figureNumber: row.figure_number || '',
      storagePath: row.image_storage_path || '',
    });
  }

  console.log(
    `[Figure Indexer] Successfully indexed ${indexedFigures.length} figures`
  );
  return indexedFigures;
}

/**
 * Index figures from analyzed figure data
 *
 * Convenience function that takes FigureAnalysis results directly.
 *
 * @param figures - Analyzed figure data from figure-analyzer
 * @param paperId - Paper ID
 * @param collectionId - Collection ID
 * @returns Number of figures indexed
 */
export async function indexAnalyzedFigures(
  figures: FigureAnalysis[],
  paperId: string,
  collectionId: string
): Promise<IndexedFigure[]> {
  const inputs: FigureChunkInput[] = figures.map(fig => ({
    paperId,
    collectionId,
    figureNumber: fig.figureNumber,
    normalizedFigureNumber: fig.normalizedFigureNumber,
    caption: fig.caption,
    description: fig.description,
    imageBuffer: fig.imageBuffer,
    pageNumber: fig.pageNumber,
    type: fig.type,
    mentionedInChunkIds: fig.mentionedInChunkIds,
  }));

  return indexFigures(inputs);
}

/**
 * Delete all figure chunks for a paper
 *
 * @param paperId - Paper ID
 * @param collectionId - Collection ID
 * @returns Number of chunks deleted
 */
export async function deleteFigureChunks(
  paperId: string,
  collectionId: string
): Promise<number> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from('paper_chunks')
    .delete()
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId)
    .eq('chunk_type', 'figure')
    .select('id');

  if (error) {
    throw new Error(`Failed to delete figure chunks: ${error.message}`);
  }

  return data?.length || 0;
}

/**
 * Build searchable content for a figure chunk
 *
 * This creates a text representation that can be:
 * - Embedded for vector search
 * - Indexed for full-text search
 */
function buildFigureContent(
  figureNumber: string,
  caption: string,
  description: string
): string {
  const parts: string[] = [`[${figureNumber}]`];

  if (caption) {
    parts.push(`Caption: ${caption}`);
  }

  if (description) {
    parts.push('');
    parts.push(description);
  }

  return parts.join('\n').trim();
}

/**
 * Get figure chunk by figure number
 *
 * @param paperId - Paper ID
 * @param collectionId - Collection ID
 * @param figureNumber - Normalized figure number
 * @returns Figure chunk data or null
 */
export async function getFigureChunk(
  paperId: string,
  collectionId: string,
  figureNumber: string
): Promise<{
  id: string;
  content: string;
  figureCaption: string;
  figureDescription: string;
  imageStoragePath: string;
  pageNumber: number;
} | null> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from('paper_chunks')
    .select(
      'id, content, figure_caption, figure_description, image_storage_path, page_number'
    )
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId)
    .eq('chunk_type', 'figure')
    .eq('figure_number', figureNumber)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    content: data.content,
    figureCaption: data.figure_caption || '',
    figureDescription: data.figure_description || '',
    imageStoragePath: data.image_storage_path || '',
    pageNumber: data.page_number || 0,
  };
}
