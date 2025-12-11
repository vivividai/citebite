import { SupabaseClient } from '@supabase/supabase-js';
import { Database, TablesInsert } from '@/types/database.types';
import { deleteCollectionPdfs } from '@/lib/storage/supabaseStorage';
import { deleteChunksForCollection } from '@/lib/db/chunks';
import type { RelationshipType } from '@/types/graph';

type CollectionInsert = TablesInsert<'collections'>;

/**
 * Create a new collection in the database
 */
export async function createCollection(
  supabase: SupabaseClient<Database>,
  data: CollectionInsert
) {
  const { data: collection, error } = await supabase
    .from('collections')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create collection: ${error.message}`);
  }

  return collection;
}

/**
 * Paper link data for collection_papers junction table
 */
export interface PaperLinkData {
  paperId: string;
  sourcePaperId?: string | null;
  relationshipType?: RelationshipType;
  similarityScore?: number | null;
  degree?: number; // 0=search, 1-3=expansion levels
}

/**
 * Link papers to a collection via collection_papers junction table
 * @param supabase Supabase client
 * @param collectionId Collection ID
 * @param papers Array of paper IDs or paper link data with relationship info
 */
export async function linkPapersToCollection(
  supabase: SupabaseClient<Database>,
  collectionId: string,
  papers: string[] | PaperLinkData[]
) {
  // Normalize input: convert string[] to PaperLinkData[]
  const paperDataArray: PaperLinkData[] =
    typeof papers[0] === 'string'
      ? (papers as string[]).map(paperId => ({ paperId }))
      : (papers as PaperLinkData[]);

  const collectionPapers = paperDataArray.map(paper => ({
    collection_id: collectionId,
    paper_id: paper.paperId,
    source_paper_id: paper.sourcePaperId ?? null,
    relationship_type: paper.relationshipType ?? 'search',
    similarity_score: paper.similarityScore ?? null,
    degree: paper.degree ?? 0,
  }));

  const { error } = await supabase
    .from('collection_papers')
    .insert(collectionPapers);

  if (error) {
    throw new Error(`Failed to link papers to collection: ${error.message}`);
  }
}

/**
 * Get collection by ID with ownership check
 */
export async function getCollectionWithOwnership(
  supabase: SupabaseClient<Database>,
  collectionId: string,
  userId: string
) {
  const { data: collection, error } = await supabase
    .from('collections')
    .select('*')
    .eq('id', collectionId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Collection not found or access denied');
    }
    throw new Error(`Failed to fetch collection: ${error.message}`);
  }

  return collection;
}

/**
 * Get user's collections with paper counts
 */
export async function getUserCollections(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  // Get all collections for the user
  const { data: collections, error: collectionsError } = await supabase
    .from('collections')
    .select(
      'id, name, search_query, filters, created_at, use_ai_assistant, natural_language_query'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (collectionsError) {
    throw new Error(`Failed to fetch collections: ${collectionsError.message}`);
  }

  // For each collection, get paper counts
  const collectionsWithCounts = await Promise.all(
    collections.map(async collection => {
      // Get total papers for this collection
      const { count: totalPapers, error: totalError } = await supabase
        .from('collection_papers')
        .select('*', { count: 'exact', head: true })
        .eq('collection_id', collection.id);

      if (totalError) {
        console.error(
          `Failed to get total papers for collection ${collection.id}:`,
          totalError
        );
      }

      // Get indexed papers for this collection
      const { count: indexedPapers, error: indexedError } = await supabase
        .from('collection_papers')
        .select('paper_id, papers!inner(vector_status)', {
          count: 'exact',
          head: true,
        })
        .eq('collection_id', collection.id)
        .eq('papers.vector_status', 'completed');

      if (indexedError) {
        console.error(
          `Failed to get indexed papers for collection ${collection.id}:`,
          indexedError
        );
      }

      return {
        ...collection,
        totalPapers: totalPapers || 0,
        indexedPapers: indexedPapers || 0,
      };
    })
  );

  return collectionsWithCounts;
}

/**
 * Get a single collection by ID with paper counts
 */
export async function getCollectionById(
  supabase: SupabaseClient<Database>,
  collectionId: string,
  userId: string
) {
  // Get collection with ownership check
  const collection = await getCollectionWithOwnership(
    supabase,
    collectionId,
    userId
  );

  // Get total papers for this collection
  const { count: totalPapers, error: totalError } = await supabase
    .from('collection_papers')
    .select('*', { count: 'exact', head: true })
    .eq('collection_id', collection.id);

  if (totalError) {
    console.error(
      `Failed to get total papers for collection ${collection.id}:`,
      totalError
    );
  }

  // Get indexed papers for this collection
  const { count: indexedPapers, error: indexedError } = await supabase
    .from('collection_papers')
    .select('paper_id, papers!inner(vector_status)', {
      count: 'exact',
      head: true,
    })
    .eq('collection_id', collection.id)
    .eq('papers.vector_status', 'completed');

  if (indexedError) {
    console.error(
      `Failed to get indexed papers for collection ${collection.id}:`,
      indexedError
    );
  }

  // Get failed papers count
  const { count: failedPapers, error: failedError } = await supabase
    .from('collection_papers')
    .select('paper_id, papers!inner(vector_status)', {
      count: 'exact',
      head: true,
    })
    .eq('collection_id', collection.id)
    .eq('papers.vector_status', 'failed');

  if (failedError) {
    console.error(
      `Failed to get failed papers for collection ${collection.id}:`,
      failedError
    );
  }

  return {
    ...collection,
    totalPapers: totalPapers || 0,
    indexedPapers: indexedPapers || 0,
    failedPapers: failedPapers || 0,
  };
}

/**
 * Delete a collection by ID with ownership check
 * This will cascade delete all related data:
 * - Vector chunks from pgvector (paper_chunks)
 * - PDFs from Supabase Storage
 * - collection_papers entries
 * - conversations and messages
 */
export async function deleteCollection(
  supabase: SupabaseClient<Database>,
  collectionId: string,
  userId: string
) {
  // First verify ownership
  await getCollectionWithOwnership(supabase, collectionId, userId);

  // Delete all vector chunks for this collection
  try {
    await deleteChunksForCollection(collectionId);
    console.log(`Deleted vector chunks for collection ${collectionId}`);
  } catch (error) {
    console.error(
      `Failed to delete chunks for collection ${collectionId}:`,
      error
    );
  }

  // Delete all PDFs from Supabase Storage
  try {
    const deletedCount = await deleteCollectionPdfs(collectionId);
    console.log(
      `Deleted ${deletedCount} PDF files for collection ${collectionId}`
    );
  } catch (error) {
    // Log error but don't fail the entire deletion
    // Storage cleanup failure shouldn't prevent collection deletion
    console.error(
      `Failed to delete PDFs for collection ${collectionId}:`,
      error
    );
  }

  // Delete the collection (CASCADE will handle related data)
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', collectionId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete collection: ${error.message}`);
  }
}
