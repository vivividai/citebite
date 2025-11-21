/**
 * Test script to inspect Gemini File Search grounding metadata structure
 *
 * This script queries Gemini with File Search and logs the complete
 * grounding metadata structure to understand what metadata is available.
 */

import { queryWithFileSearch } from '../src/lib/gemini/chat';

async function main() {
  // Get collection ID and File Search Store ID from environment or args
  const collectionId = process.argv[2];
  const fileSearchStoreId = process.argv[3];

  if (!collectionId || !fileSearchStoreId) {
    console.error(
      'Usage: npx tsx scripts/test-grounding-metadata.ts <collection_id> <file_search_store_id>'
    );
    console.error('');
    console.error('Example:');
    console.error(
      '  npx tsx scripts/test-grounding-metadata.ts 4888f72b-c2cb-4288-b87c-059fab917847 abc123'
    );
    process.exit(1);
  }

  console.log('Testing Gemini File Search grounding metadata...');
  console.log(`Collection ID: ${collectionId}`);
  console.log(`File Search Store ID: ${fileSearchStoreId}`);
  console.log('');

  try {
    // Query with a question that will likely trigger citations
    const response = await queryWithFileSearch(
      fileSearchStoreId,
      'What are the main findings in the papers?',
      [],
      []
    );

    console.log('=== RESPONSE ANSWER ===');
    console.log(response.answer);
    console.log('');

    console.log('=== GROUNDING CHUNKS ===');
    console.log(`Total chunks: ${response.groundingChunks.length}`);
    console.log('');

    response.groundingChunks.forEach((chunk, index) => {
      console.log(`--- Chunk ${index + 1} ---`);
      console.log(JSON.stringify(chunk, null, 2));
      console.log('');
    });

    console.log('=== GROUNDING SUPPORTS ===');
    console.log(`Total supports: ${response.groundingSupports.length}`);
    console.log('');

    response.groundingSupports.forEach((support, index) => {
      console.log(`--- Support ${index + 1} ---`);
      console.log(JSON.stringify(support, null, 2));
      console.log('');
    });

    console.log('=== ANALYSIS ===');
    console.log('Fields available in each chunk:');
    if (response.groundingChunks.length > 0) {
      const firstChunk = response.groundingChunks[0];
      console.log(
        '  - retrievedContext.text: ',
        firstChunk.retrievedContext?.text ? '✓ (text content)' : '✗'
      );
      console.log(
        '  - retrievedContext.fileSearchStore: ',
        firstChunk.retrievedContext?.fileSearchStore ? '✓' : '✗'
      );
      console.log('  - Full chunk keys: ', Object.keys(firstChunk));
      console.log(
        '  - retrievedContext keys: ',
        Object.keys(firstChunk.retrievedContext || {})
      );
    }
  } catch (error) {
    console.error('Error querying Gemini:', error);
    process.exit(1);
  }
}

main();
