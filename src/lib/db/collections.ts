import { SupabaseClient } from '@supabase/supabase-js';
import { Database, TablesInsert } from '@/types/database.types';

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
 * Update collection with file search store ID
 */
export async function updateCollectionFileSearchStore(
  supabase: SupabaseClient<Database>,
  collectionId: string,
  fileSearchStoreId: string
) {
  const { error } = await supabase
    .from('collections')
    .update({ file_search_store_id: fileSearchStoreId })
    .eq('id', collectionId);

  if (error) {
    throw new Error(`Failed to update collection: ${error.message}`);
  }
}

/**
 * Link papers to a collection via collection_papers junction table
 */
export async function linkPapersToCollection(
  supabase: SupabaseClient<Database>,
  collectionId: string,
  paperIds: string[]
) {
  const collectionPapers = paperIds.map(paperId => ({
    collection_id: collectionId,
    paper_id: paperId,
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
    .select('id, name, search_query, filters, created_at, file_search_store_id')
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
