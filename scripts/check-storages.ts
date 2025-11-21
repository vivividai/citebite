/**
 * Script to check current storage status
 * - Supabase Storage buckets and files
 * - Gemini File Search Stores and documents
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getGeminiClient } from '../src/lib/gemini/client';

// Load environment variables
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function checkStorages() {
  console.log('='.repeat(60));
  console.log('STORAGE STATUS CHECK');
  console.log('='.repeat(60));

  // 1. Check Supabase Storage
  console.log('\n📦 SUPABASE STORAGE');
  console.log('-'.repeat(60));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // List all buckets
    const { data: buckets, error: bucketError } =
      await supabase.storage.listBuckets();
    if (bucketError) {
      console.error('❌ Failed to list buckets:', bucketError.message);
    } else {
      console.log(`Found ${buckets.length} bucket(s):\n`);
      for (const bucket of buckets) {
        console.log(`  - ${bucket.name}`);
        console.log(`    ID: ${bucket.id}`);
        console.log(`    Public: ${bucket.public}`);
        console.log(
          `    File size limit: ${bucket.file_size_limit ? `${bucket.file_size_limit / 1024 / 1024}MB` : 'unlimited'}`
        );
        console.log(
          `    Allowed MIME types: ${bucket.allowed_mime_types?.join(', ') || 'all'}`
        );

        // List files in bucket
        const { data: files, error: filesError } = await supabase.storage
          .from(bucket.name)
          .list('', { limit: 1000 });

        if (filesError) {
          console.log(`    Files: Error listing files - ${filesError.message}`);
        } else {
          console.log(`    Files: ${files.length} file(s)`);
          if (files.length > 0) {
            console.log(`    Recent files:`);
            files.slice(0, 5).forEach(file => {
              console.log(
                `      - ${file.name} (${(file.metadata?.size || 0) / 1024 / 1024} MB)`
              );
            });
            if (files.length > 5) {
              console.log(`      ... and ${files.length - 5} more`);
            }
          }
        }
        console.log();
      }
    }
  } catch (error) {
    console.error('❌ Error checking Supabase Storage:', error);
  }

  // 2. Check Gemini File Search Stores
  console.log('\n🤖 GEMINI FILE SEARCH STORES');
  console.log('-'.repeat(60));

  try {
    // Get collections with file_search_store_id
    const { data: collections, error: collectionsError } = await supabase
      .from('collections')
      .select('id, name, file_search_store_id')
      .not('file_search_store_id', 'is', null);

    if (collectionsError) {
      console.error(
        '❌ Failed to query collections:',
        collectionsError.message
      );
    } else {
      console.log(
        `Found ${collections.length} collection(s) with File Search Stores:\n`
      );

      if (collections.length === 0) {
        console.log('  (No collections with File Search Stores found)');
      } else {
        const geminiClient = getGeminiClient();

        for (const collection of collections) {
          console.log(`  Collection: ${collection.name}`);
          console.log(`    ID: ${collection.id}`);
          console.log(
            `    File Search Store ID: ${collection.file_search_store_id}`
          );

          try {
            // Try to get store info from Gemini
            const store = await geminiClient.fileSearchStores.get({
              name: `fileSearchStores/${collection.file_search_store_id}`,
            });

            console.log(`    Store Name: ${store.displayName || 'N/A'}`);
            console.log(`    Status: ✅ Active`);

            // Try to list documents in the store
            try {
              const documents =
                await geminiClient.fileSearchStores.listDocuments({
                  parent: `fileSearchStores/${collection.file_search_store_id}`,
                });

              const docCount = documents.documents?.length || 0;
              console.log(`    Documents: ${docCount} document(s)`);

              if (docCount > 0 && documents.documents) {
                console.log(`    Recent documents:`);
                documents.documents
                  .slice(0, 3)
                  .forEach((doc: { displayName?: string }) => {
                    console.log(`      - ${doc.displayName || 'Unnamed'}`);
                  });
                if (docCount > 3) {
                  console.log(`      ... and ${docCount - 3} more`);
                }
              }
            } catch (docError: unknown) {
              const message =
                docError instanceof Error ? docError.message : String(docError);
              console.log(`    Documents: Error listing - ${message}`);
            }
          } catch (storeError: unknown) {
            const message =
              storeError instanceof Error
                ? storeError.message
                : String(storeError);
            console.log(`    Status: ❌ Not found or error - ${message}`);
          }

          console.log();
        }
      }
    }
  } catch (error) {
    console.error('❌ Error checking Gemini File Search:', error);
  }

  console.log('='.repeat(60));
  console.log('CHECK COMPLETE');
  console.log('='.repeat(60));
}

// Run the check
checkStorages().catch(console.error);
