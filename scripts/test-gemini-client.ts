#!/usr/bin/env tsx
/**
 * Test Gemini Client Configuration
 * Verifies Gemini API connectivity and File Search Store access
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getGeminiClient } from '../src/lib/gemini/client';
import { createClient } from '@supabase/supabase-js';

async function testGeminiClient() {
  console.log('=================================');
  console.log('Gemini Client Configuration Test');
  console.log('=================================\n');

  // Step 1: Check API key
  console.log('1. Checking API Key...');
  if (!process.env.GEMINI_API_KEY) {
    console.log('   ❌ GEMINI_API_KEY not found in environment');
    process.exit(1);
  }
  console.log('   ✓ GEMINI_API_KEY is set');
  console.log(
    '   Key prefix:',
    process.env.GEMINI_API_KEY.substring(0, 10) + '...'
  );

  // Step 2: Initialize client
  console.log('\n2. Initializing Gemini Client...');
  try {
    const client = getGeminiClient();
    console.log('   ✓ Client initialized successfully');
    console.log('   Client type:', client.constructor.name);
    console.log('   Available methods:', Object.keys(client).join(', '));
  } catch (error) {
    console.log('   ❌ Failed to initialize client:', error);
    process.exit(1);
  }

  // Step 3: Check File Search Stores capability
  console.log('\n3. Checking File Search Stores API...');
  const client = getGeminiClient();

  // Check if fileSearchStores exists
  if (!client.fileSearchStores) {
    console.log('   ❌ fileSearchStores API not available on client');
    console.log('   Available properties:', Object.keys(client));
    process.exit(1);
  }
  console.log('   ✓ fileSearchStores API is available');
  console.log(
    '   Methods:',
    Object.keys(client.fileSearchStores).filter(
      k =>
        typeof (client.fileSearchStores as Record<string, unknown>)[k] ===
        'function'
    )
  );

  // Step 4: Test accessing an existing File Search Store
  console.log('\n4. Testing File Search Store access...');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: collection } = await supabase
    .from('collections')
    .select('file_search_store_id')
    .not('file_search_store_id', 'is', null)
    .limit(1)
    .single();

  if (!collection?.file_search_store_id) {
    console.log('   ⚠ No collections with file_search_store_id found');
    console.log('   Skipping File Search Store access test');
  } else {
    console.log('   Testing with store ID:', collection.file_search_store_id);

    try {
      const store = await client.fileSearchStores.get({
        name: `fileSearchStores/${collection.file_search_store_id}`,
      });
      console.log('   ✓ Successfully accessed File Search Store');
      console.log('   Store name:', store.name);
      console.log('   Display name:', store.displayName);
    } catch (error) {
      console.log('   ❌ Failed to access File Search Store');
      console.log(
        '   Error:',
        error instanceof Error ? error.message : String(error)
      );
      console.log('   Error details:', JSON.stringify(error, null, 2));
    }
  }

  // Step 5: Test uploadToFileSearchStore method signature
  console.log('\n5. Checking uploadToFileSearchStore method...');
  if (!client.fileSearchStores.uploadToFileSearchStore) {
    console.log('   ❌ uploadToFileSearchStore method not found');
    console.log('   Available methods:', Object.keys(client.fileSearchStores));
    process.exit(1);
  }
  console.log('   ✓ uploadToFileSearchStore method exists');
  console.log(
    '   Method signature:',
    client.fileSearchStores.uploadToFileSearchStore
      .toString()
      .substring(0, 200) + '...'
  );

  // Step 6: Check operations API
  console.log('\n6. Checking Operations API...');
  if (!client.operations) {
    console.log('   ❌ operations API not available');
    console.log('   Available properties:', Object.keys(client));
    process.exit(1);
  }
  console.log('   ✓ operations API is available');
  console.log(
    '   Methods:',
    Object.keys(client.operations).filter(
      k =>
        typeof (client.operations as Record<string, unknown>)[k] === 'function'
    )
  );

  console.log('\n=================================');
  console.log('✅ All Gemini client tests passed!');
  console.log('=================================\n');
}

testGeminiClient().catch(err => {
  console.error('\n❌ Test failed:', err);
  console.error('\nStack trace:', err.stack);
  process.exit(1);
});
