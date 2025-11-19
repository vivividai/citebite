/**
 * Test Gemini File Search Store access
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { getGeminiClient } from '@/lib/gemini/client';

async function testStoreAccess() {
  const client = getGeminiClient();

  // Test with a known store ID from database
  const storeId = 'machine-learning-papers-e04-s9x2wphn2pu9';

  console.log(`🔍 Testing access to store: ${storeId}\n`);

  try {
    const store = await client.fileSearchStores.get({
      name: `fileSearchStores/${storeId}`,
    });

    console.log('✅ Store found!\n');
    console.log('Store Details:');
    console.log(JSON.stringify(store, null, 2));
  } catch (error: unknown) {
    console.error('❌ Failed to get store:', error.message);
    console.error('\nFull error:', error);

    if (error.message?.includes('not found')) {
      console.log('\n⚠️  Store does not exist in Gemini.');
      console.log('   Possible reasons:');
      console.log('   1. Store was deleted from Gemini');
      console.log('   2. Different API key was used to create it');
      console.log('   3. Store creation failed but DB was updated');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Testing fileSearchStores.list API...\n');

  try {
    const response = await client.fileSearchStores.list({
      pageSize: 20,
    });

    console.log('✅ List API response:');
    console.log(JSON.stringify(response, null, 2));

    if (!response.fileSearchStores || response.fileSearchStores.length === 0) {
      console.log('\n⚠️  No stores found in Gemini API account.');
      console.log('   This means either:');
      console.log('   1. All stores were deleted');
      console.log(
        "   2. You're using a different Gemini API key than when stores were created"
      );
    }
  } catch (error: unknown) {
    console.error('❌ Failed to list stores:', error.message);
  }
}

testStoreAccess().catch(console.error);
