#!/usr/bin/env tsx
/**
 * Test Gemini PDF Upload Process
 * Tests the complete PDF upload to File Search Store
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getGeminiClient } from '../src/lib/gemini/client';
import { createClient } from '@supabase/supabase-js';
import { downloadPdf } from '../src/lib/storage/supabaseStorage';
import { PaperMetadata } from '../src/lib/gemini/types';

async function testPdfUpload() {
  console.log('=================================');
  console.log('Gemini PDF Upload Test');
  console.log('=================================\n');

  // Get a test paper
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('1. Finding a test paper...');
  const { data: papers } = await supabase
    .from('collection_papers')
    .select(
      'collection_id, paper_id, collections(file_search_store_id), papers(title, authors, year, venue)'
    )
    .limit(1);

  if (!papers || papers.length === 0) {
    console.log('   ❌ No papers found');
    process.exit(1);
  }

  const testPaper = papers[0];
  console.log('   ✓ Found paper:', testPaper.paper_id);
  console.log('   Collection:', testPaper.collection_id);
  console.log(
    '   Store ID:',
    (testPaper.collections as { file_search_store_id?: string })
      ?.file_search_store_id
  );

  // Download PDF
  console.log('\n2. Downloading PDF from storage...');
  try {
    const pdfBuffer = await downloadPdf(
      testPaper.collection_id,
      testPaper.paper_id
    );
    console.log('   ✓ Downloaded PDF:', pdfBuffer.length, 'bytes');

    // Prepare metadata
    const paper = testPaper.papers as {
      title: string;
      authors?: unknown;
      year?: number;
      venue?: string;
    };
    const authorsString = paper.authors
      ? JSON.stringify(paper.authors)
      : undefined;
    const metadata: PaperMetadata = {
      paper_id: testPaper.paper_id,
      title: paper.title.substring(0, 256),
      authors: authorsString?.substring(0, 256),
      year: paper.year || undefined,
      venue: paper.venue?.substring(0, 256),
    };

    console.log('   Metadata prepared:', {
      paper_id: metadata.paper_id,
      title: metadata.title.substring(0, 50) + '...',
      authors_length: metadata.authors?.length,
      year: metadata.year,
      venue: metadata.venue?.substring(0, 30),
    });

    // Upload to Gemini
    console.log('\n3. Uploading to Gemini File Search Store...');
    const client = getGeminiClient();
    const storeId = (testPaper.collections as { file_search_store_id?: string })
      .file_search_store_id;

    console.log('   Store ID:', storeId);
    console.log('   Creating Blob from PDF buffer...');

    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    console.log('   ✓ Blob created:', blob.size, 'bytes, type:', blob.type);

    console.log('   Calling uploadToFileSearchStore...');
    const operation = await client.fileSearchStores.uploadToFileSearchStore({
      fileSearchStoreName: `fileSearchStores/${storeId}`,
      file: blob,
      config: {
        mimeType: 'application/pdf',
        displayName: metadata.title,
        customMetadata: [
          { key: 'paper_id', stringValue: metadata.paper_id },
          { key: 'title', stringValue: metadata.title },
          ...(metadata.authors
            ? [{ key: 'authors', stringValue: metadata.authors }]
            : []),
          ...(metadata.year
            ? [{ key: 'year', stringValue: metadata.year.toString() }]
            : []),
          ...(metadata.venue
            ? [{ key: 'venue', stringValue: metadata.venue }]
            : []),
        ],
      },
    });

    console.log('   ✓ Upload operation created');
    console.log('   Operation object:', JSON.stringify(operation, null, 2));

    // Check operation properties
    console.log('\n4. Checking operation response...');
    console.log('   operation type:', typeof operation);
    console.log('   operation keys:', Object.keys(operation || {}));
    console.log('   operation.name:', operation?.name);
    console.log('   operation.done:', operation?.done);
    console.log('   operation.error:', operation?.error);
    console.log('   operation.response:', operation?.response);

    if (!operation || !operation.name) {
      console.log('\n   ❌ PROBLEM FOUND: operation.name is undefined!');
      console.log('   This is why the polling function fails');
      console.log('   Full operation object:', operation);
      process.exit(1);
    }

    console.log('\n5. Polling operation until completion...');
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      console.log(`   Attempt ${attempts + 1}/${maxAttempts}...`);

      const updatedOperation = await client.operations.get({
        name: operation.name,
      });

      console.log('   Done:', updatedOperation.done);

      if (updatedOperation.done) {
        if (updatedOperation.error) {
          console.log('   ❌ Operation failed:', updatedOperation.error);
          process.exit(1);
        }

        console.log('   ✓ Operation completed successfully!');
        console.log(
          '   Response:',
          JSON.stringify(updatedOperation.response, null, 2)
        );
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.log('   ⚠ Operation timeout');
    }
  } catch (error) {
    console.log(
      '\n   ❌ Error occurred:',
      error instanceof Error ? error.message : String(error)
    );
    console.log(
      '   Error type:',
      error instanceof Error ? error.constructor.name : typeof error
    );
    console.log(
      '   Stack trace:',
      error instanceof Error ? error.stack : 'N/A'
    );
    process.exit(1);
  }

  console.log('\n=================================');
  console.log('✅ PDF Upload Test Completed!');
  console.log('=================================\n');
}

testPdfUpload().catch(err => {
  console.error('\n❌ Test failed:', err);
  console.error('Stack:', err.stack);
  process.exit(1);
});
