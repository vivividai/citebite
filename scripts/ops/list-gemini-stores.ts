/**
 * List all Gemini File Search Stores and their details
 *
 * This script helps you inspect your Gemini File Search stores
 * and see what's uploaded.
 *
 * Usage: npx tsx scripts/list-gemini-stores.ts
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { getGeminiClient } from '@/lib/gemini/client';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

interface StoreDetails {
  name: string;
  displayName?: string;
  activeDocumentsCount?: number;
  pendingDocumentsCount?: number;
  failedDocumentsCount?: number;
  sizeBytes?: number;
  createTime?: string;
  updateTime?: string;
}

/**
 * List all File Search stores
 */
async function listAllStores(): Promise<StoreDetails[]> {
  const client = getGeminiClient();
  const stores: StoreDetails[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const response = await client.fileSearchStores.list({
        pageSize: 20,
        pageToken,
      });

      // The SDK returns stores in pageInternal field (undocumented)
      const storeList =
        (response as { pageInternal?: unknown[] }).pageInternal ||
        response.fileSearchStores ||
        [];

      if (storeList && storeList.length > 0) {
        stores.push(
          ...storeList.map((store: Record<string, unknown>) => ({
            name: String(store.name || ''),
            displayName: store.displayName as string,
            activeDocumentsCount:
              parseInt(String(store.activeDocumentsCount || 0)) || 0,
            pendingDocumentsCount:
              parseInt(String(store.pendingDocumentsCount || 0)) || 0,
            failedDocumentsCount:
              parseInt(String(store.failedDocumentsCount || 0)) || 0,
            sizeBytes: parseInt(String(store.sizeBytes || 0)) || 0,
            createTime: store.createTime as string,
            updateTime: store.updateTime as string,
          }))
        );
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return stores;
  } catch (error) {
    console.error('Failed to list stores:', error);
    throw error;
  }
}

/**
 * Get collections from database with their store IDs
 */
async function getCollectionsWithStores() {
  const supabase = createAdminSupabaseClient();

  const { data: collections, error } = await supabase
    .from('collections')
    .select('id, name, file_search_store_id, created_at')
    .not('file_search_store_id', 'is', null);

  if (error) {
    console.error('Failed to fetch collections:', error);
    return [];
  }

  return collections || [];
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format date to readable string
 */
function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString();
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Fetching Gemini File Search Stores...\n');

  try {
    // Fetch stores from Gemini
    const stores = await listAllStores();
    console.log(`✅ Found ${stores.length} File Search Store(s)\n`);

    if (stores.length === 0) {
      console.log(
        '📭 No stores found. Create a collection to generate a store.'
      );
      return;
    }

    // Fetch collections from database
    const collections = await getCollectionsWithStores();
    const storeToCollection = new Map(
      collections.map(c => [c.file_search_store_id, c])
    );

    // Display store details
    stores.forEach((store, index) => {
      const storeId = store.name.split('/').pop() || '';
      const collection = storeToCollection.get(storeId);

      console.log(`${'='.repeat(80)}`);
      console.log(`📦 Store #${index + 1}`);
      console.log(`${'='.repeat(80)}`);
      console.log(`Store ID:        ${storeId}`);
      console.log(`Display Name:    ${store.displayName || 'N/A'}`);

      if (collection) {
        console.log(`\n📚 Linked Collection:`);
        console.log(`  - Collection ID:   ${collection.id}`);
        console.log(`  - Collection Name: ${collection.name}`);
        console.log(
          `  - Created:         ${formatDate(collection.created_at)}`
        );
      } else {
        console.log(
          `\n⚠️  Warning: Store not linked to any collection in database`
        );
      }

      console.log(`\n📊 Statistics:`);
      console.log(`  - Active Documents:  ${store.activeDocumentsCount || 0}`);
      console.log(`  - Pending Documents: ${store.pendingDocumentsCount || 0}`);
      console.log(`  - Failed Documents:  ${store.failedDocumentsCount || 0}`);
      console.log(`  - Total Size:        ${formatBytes(store.sizeBytes)}`);

      console.log(`\n🕒 Timestamps:`);
      console.log(`  - Created:  ${formatDate(store.createTime)}`);
      console.log(`  - Updated:  ${formatDate(store.updateTime)}`);
      console.log();
    });

    // Summary
    console.log(`${'='.repeat(80)}`);
    console.log(`📈 Summary`);
    console.log(`${'='.repeat(80)}`);

    const totalActive = stores.reduce(
      (sum, s) => sum + (s.activeDocumentsCount || 0),
      0
    );
    const totalPending = stores.reduce(
      (sum, s) => sum + (s.pendingDocumentsCount || 0),
      0
    );
    const totalFailed = stores.reduce(
      (sum, s) => sum + (s.failedDocumentsCount || 0),
      0
    );
    const totalSize = stores.reduce((sum, s) => sum + (s.sizeBytes || 0), 0);

    console.log(`Total Stores:          ${stores.length}`);
    console.log(`Total Active Docs:     ${totalActive}`);
    console.log(`Total Pending Docs:    ${totalPending}`);
    console.log(`Total Failed Docs:     ${totalFailed}`);
    console.log(`Total Storage Used:    ${formatBytes(totalSize)}`);
    console.log();

    // Warnings
    const orphanedStores = stores.filter(s => {
      const storeId = s.name.split('/').pop() || '';
      return !storeToCollection.has(storeId);
    });

    if (orphanedStores.length > 0) {
      console.log(
        `⚠️  Warning: ${orphanedStores.length} store(s) not linked to any collection`
      );
      console.log(`   These stores may be leftover from deleted collections.`);
      console.log(`   Consider cleaning them up to save storage.\n`);
    }

    if (totalFailed > 0) {
      console.log(`⚠️  Warning: ${totalFailed} document(s) failed to upload`);
      console.log(`   Check your collections for failed papers and retry.\n`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
