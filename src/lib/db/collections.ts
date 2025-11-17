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
