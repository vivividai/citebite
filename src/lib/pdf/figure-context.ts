/**
 * Figure Context Finder
 *
 * Finds text chunks that reference a specific figure.
 * Used to provide textual context when analyzing figures with Vision AI.
 */

import { createAdminSupabaseClient } from '@/lib/supabase/server';

export interface RelatedTextChunk {
  id: string;
  content: string;
  chunkIndex: number;
}

/**
 * Find text chunks that reference a specific figure
 *
 * This searches the database for text chunks that have the figure number
 * in their referenced_figures array.
 *
 * @param paperId - Paper ID
 * @param collectionId - Collection ID
 * @param figureNumber - Normalized figure number (e.g., "Figure 1")
 * @param limit - Maximum number of chunks to return (default: 5)
 * @returns Array of related text chunks
 *
 * @example
 * ```typescript
 * const chunks = await findChunksThatReferenceFigure(
 *   'paper123', 'collection456', 'Figure 1'
 * );
 * // Returns chunks that mention "Figure 1"
 * ```
 */
export async function findChunksThatReferenceFigure(
  paperId: string,
  collectionId: string,
  figureNumber: string,
  limit: number = 5
): Promise<RelatedTextChunk[]> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from('paper_chunks')
    .select('id, content, chunk_index')
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId)
    .eq('chunk_type', 'text')
    .contains('referenced_figures', [figureNumber])
    .order('chunk_index', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn(`Failed to find related chunks for ${figureNumber}:`, error);
    return [];
  }

  return (data || []).map(
    (d: { id: string; content: string; chunk_index: number }) => ({
      id: d.id,
      content: d.content,
      chunkIndex: d.chunk_index,
    })
  );
}

/**
 * Find text chunks that reference any of the given figures
 *
 * @param paperId - Paper ID
 * @param collectionId - Collection ID
 * @param figureNumbers - Array of figure numbers to search for
 * @returns Map of figure number to related chunks
 */
export async function findChunksForMultipleFigures(
  paperId: string,
  collectionId: string,
  figureNumbers: string[]
): Promise<Map<string, RelatedTextChunk[]>> {
  const result = new Map<string, RelatedTextChunk[]>();

  // Initialize empty arrays for each figure
  for (const figNum of figureNumbers) {
    result.set(figNum, []);
  }

  if (figureNumbers.length === 0) {
    return result;
  }

  const supabase = createAdminSupabaseClient();

  // Query all text chunks for this paper that have any figure references
  const { data, error } = await supabase
    .from('paper_chunks')
    .select('id, content, chunk_index, referenced_figures')
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId)
    .eq('chunk_type', 'text')
    .not('referenced_figures', 'is', null)
    .order('chunk_index', { ascending: true });

  if (error) {
    console.warn('Failed to find chunks with figure references:', error);
    return result;
  }

  // Group chunks by figure number
  for (const chunk of data || []) {
    const refs = chunk.referenced_figures as string[] | null;
    if (!refs) continue;

    for (const figNum of figureNumbers) {
      if (refs.some(ref => ref.toLowerCase() === figNum.toLowerCase())) {
        const existing = result.get(figNum) || [];
        existing.push({
          id: chunk.id,
          content: chunk.content,
          chunkIndex: chunk.chunk_index,
        });
        result.set(figNum, existing);
      }
    }
  }

  return result;
}

/**
 * Build context text from related chunks for figure analysis
 *
 * @param chunks - Related text chunks
 * @param maxLength - Maximum total context length (default: 4000 chars)
 * @returns Formatted context string
 */
export function buildFigureContext(
  chunks: RelatedTextChunk[],
  maxLength: number = 4000
): string {
  if (chunks.length === 0) {
    return '';
  }

  const parts: string[] = [];
  let totalLength = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const text = `[Text ${i + 1}]:\n${chunk.content}`;

    if (totalLength + text.length > maxLength) {
      // Truncate if exceeding max length
      const remaining = maxLength - totalLength;
      if (remaining > 200) {
        parts.push(text.substring(0, remaining) + '...');
      }
      break;
    }

    parts.push(text);
    totalLength += text.length + 2; // +2 for line breaks
  }

  return parts.join('\n\n');
}
