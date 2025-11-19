#!/usr/bin/env tsx
/**
 * Test uploadPdfToStore function directly
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { uploadPdfToStore } from '../src/lib/gemini/fileSearch';
import { createClient } from '@supabase/supabase-js';
import { downloadPdf } from '../src/lib/storage/supabaseStorage';
import { PaperMetadata } from '../src/lib/gemini/types';

async function testUploadFunction() {
  console.log('=================================');
  console.log('Testing uploadPdfToStore Function');
  console.log('=================================\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get a test paper
  console.log('1. Finding test paper...');
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
  const storeId = (testPaper.collections as { file_search_store_id?: string })
    .file_search_store_id;

  console.log('   ✓ Paper:', testPaper.paper_id);
  console.log('   Store ID:', storeId);

  // Download PDF
  console.log('\n2. Downloading PDF...');
  const pdfBuffer = await downloadPdf(
    testPaper.collection_id,
    testPaper.paper_id
  );
  console.log('   ✓ Downloaded:', pdfBuffer.length, 'bytes');

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

  console.log('   Metadata:', {
    title: metadata.title.substring(0, 40) + '...',
    authors_len: metadata.authors?.length,
    year: metadata.year,
  });

  // Call uploadPdfToStore
  console.log('\n3. Uploading to Gemini...');
  const result = await uploadPdfToStore(storeId, pdfBuffer, metadata);

  console.log('\n4. Result:');
  console.log('   Success:', result.success);
  if (result.success) {
    console.log('   ✅ File ID:', result.fileId);
  } else {
    console.log('   ❌ Error:', result.error);
  }

  console.log('\n=================================\n');
  process.exit(result.success ? 0 : 1);
}

testUploadFunction().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
