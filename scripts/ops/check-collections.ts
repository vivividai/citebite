/**
 * Check collections in the database
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminSupabaseClient } from '@/lib/supabase/server';

async function main() {
  const supabase = createAdminSupabaseClient();

  console.log('🔍 Checking collections in database...\n');

  // Get all collections
  const { data: collections, error } = await supabase
    .from('collections')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching collections:', error);
    return;
  }

  if (!collections || collections.length === 0) {
    console.log('📭 No collections found in database.');
    console.log('   Create a collection through the UI to get started.\n');
    return;
  }

  console.log(`✅ Found ${collections.length} collection(s)\n`);

  collections.forEach((collection, index) => {
    console.log(`${'='.repeat(60)}`);
    console.log(`Collection #${index + 1}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`ID:      ${collection.id}`);
    console.log(`Name:    ${collection.name}`);
    console.log(`Created: ${new Date(collection.created_at).toLocaleString()}`);
    console.log();
  });
}

main().catch(console.error);
