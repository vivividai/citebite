/**
 * Test script to verify Gemini File Search grounding metadata structure
 *
 * This script:
 * 1. Fetches a collection from the database
 * 2. Sends a research question to Gemini
 * 3. Logs the full grounding metadata to understand the structure
 */

import { createClient } from '@supabase/supabase-js';
import { getGeminiClient } from '../src/lib/gemini/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function main() {
  // 1. Connect to Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 2. Get a collection with file_search_store_id
  const { data: collections, error } = await supabase
    .from('collections')
    .select('id, name, file_search_store_id')
    .not('file_search_store_id', 'is', null)
    .limit(1);

  if (error || !collections || collections.length === 0) {
    console.error('No collections with file_search_store_id found:', error);
    return;
  }

  const collection = collections[0];
  console.log('\n=== Collection Info ===');
  console.log(`Name: ${collection.name}`);
  console.log(`ID: ${collection.id}`);
  console.log(`File Search Store ID: ${collection.file_search_store_id}`);

  // 3. Get papers in the collection for validation
  const { data: papers, error: papersError } = await supabase
    .from('collection_papers')
    .select(
      `
      paper_id,
      papers (
        paper_id,
        title,
        vector_status
      )
    `
    )
    .eq('collection_id', collection.id)
    .limit(10);

  if (papersError || !papers) {
    console.error('Failed to get papers:', papersError);
    return;
  }

  console.log('\n=== Papers in Collection ===');
  const allPapers = papers.map(cp => ({
    paper_id: cp.papers?.paper_id,
    title: cp.papers?.title,
    vector_status: cp.papers?.vector_status,
  }));

  allPapers.forEach((paper, i) => {
    console.log(`${i + 1}. [${paper.paper_id}] ${paper.title}`);
    console.log(`   Status: ${paper.vector_status}`);
  });

  // Filter to only indexed papers
  const indexedPapers = allPapers.filter(p => p.vector_status === 'indexed');
  console.log(`\nTotal papers: ${allPapers.length}`);
  console.log(`Indexed papers: ${indexedPapers.length}`);

  if (indexedPapers.length === 0) {
    console.log(
      '\n⚠️  No indexed papers found. Continuing with all papers for testing...'
    );
  }

  // 4. Send a research question to Gemini
  const question =
    'What are the main quantum computing architectures discussed in these papers?';

  console.log('\n=== Sending Question to Gemini ===');
  console.log(`Question: ${question}`);

  const client = getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [{ text: question }],
        },
      ],
      config: {
        tools: [
          {
            fileSearch: {
              fileSearchStoreNames: [
                `fileSearchStores/${collection.file_search_store_id}`,
              ],
            },
          },
        ],
      },
    });

    // 5. Log the full response
    console.log('\n=== Full Gemini Response ===');
    console.log(JSON.stringify(response, null, 2));

    // 6. Extract and log grounding metadata specifically
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    console.log('\n=== Grounding Metadata ===');
    if (groundingMetadata) {
      console.log(JSON.stringify(groundingMetadata, null, 2));

      // Log specific fields
      console.log('\n=== Grounding Metadata Fields ===');
      console.log(
        `Has groundingChunks: ${!!groundingMetadata.groundingChunks}`
      );
      console.log(
        `Has grounding_chunks: ${!!groundingMetadata.grounding_chunks}`
      );
      console.log(
        `Has retrievalMetadata: ${!!groundingMetadata.retrievalMetadata}`
      );
      console.log(
        `Has groundingSupports: ${!!groundingMetadata.groundingSupports}`
      );

      if (
        groundingMetadata.groundingChunks &&
        groundingMetadata.groundingChunks.length > 0
      ) {
        console.log('\n=== First Grounding Chunk ===');
        console.log(
          JSON.stringify(groundingMetadata.groundingChunks[0], null, 2)
        );
      }

      if (
        groundingMetadata.grounding_chunks &&
        groundingMetadata.grounding_chunks.length > 0
      ) {
        console.log('\n=== First grounding_chunk (snake_case) ===');
        console.log(
          JSON.stringify(groundingMetadata.grounding_chunks[0], null, 2)
        );
      }
    } else {
      console.log('No grounding metadata found!');
    }

    // 7. Try to extract citations using current logic
    console.log('\n=== Testing Current Citation Extraction ===');
    const chunks =
      groundingMetadata?.groundingChunks ||
      groundingMetadata?.grounding_chunks ||
      [];
    console.log(`Found ${chunks.length} chunks`);

    for (const chunk of chunks) {
      console.log('\n--- Chunk ---');
      console.log(`Type: ${typeof chunk}`);
      console.log(`Keys: ${Object.keys(chunk).join(', ')}`);

      // Try to extract paper_id
      const documentName = chunk.document?.name || chunk.documentName;
      const metadata = chunk.document?.metadata || chunk.metadata;

      console.log(`Document name: ${documentName}`);
      console.log(`Metadata: ${JSON.stringify(metadata, null, 2)}`);

      // Check if it's retrievedContext type
      if (chunk.retrievedContext) {
        console.log('This is a retrievedContext chunk!');
        console.log(JSON.stringify(chunk.retrievedContext, null, 2));
      }
    }
  } catch (error) {
    console.error('Error calling Gemini:', error);
  }
}

main().catch(console.error);
