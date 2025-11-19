#!/usr/bin/env tsx
/**
 * E2E Test for PDF Indexing Worker
 * Tests the complete flow of queuing and processing a PDF indexing job
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { queuePdfIndexing } from '../src/lib/jobs/queues';
import { createClient } from '@supabase/supabase-js';

async function testPdfIndexing() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('=================================');
  console.log('PDF Indexing Worker E2E Test');
  console.log('=================================\n');

  // Get a pending paper from the database
  const { data: papers, error: fetchError } = await supabase
    .from('collection_papers')
    .select('collection_id, paper_id')
    .limit(1);

  if (fetchError || !papers || papers.length === 0) {
    console.log('❌ No papers found to test');
    console.log('   Create a collection with papers first');
    process.exit(1);
  }

  const testPaper = papers[0];
  const storageKey = `${testPaper.collection_id}/${testPaper.paper_id}.pdf`;

  console.log('📝 Test Paper:');
  console.log('   Collection ID:', testPaper.collection_id);
  console.log('   Paper ID:', testPaper.paper_id);
  console.log('   Storage Key:', storageKey);

  // Check initial status
  const { data: initialPaper } = await supabase
    .from('papers')
    .select('paper_id, title, vector_status')
    .eq('paper_id', testPaper.paper_id)
    .single();

  console.log('\n📊 Initial Status:');
  console.log('   Paper:', initialPaper?.title?.substring(0, 60) + '...');
  console.log('   Vector Status:', initialPaper?.vector_status || 'unknown');

  // Queue the indexing job
  console.log('\n🚀 Queuing PDF indexing job...');
  const jobId = await queuePdfIndexing({
    collectionId: testPaper.collection_id,
    paperId: testPaper.paper_id,
    storageKey: storageKey,
  });

  console.log('✓ Job queued with ID:', jobId);
  console.log('\n⏳ Waiting 15 seconds for job to process...');

  // Wait for job to process
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Check final status
  const { data: finalPaper } = await supabase
    .from('papers')
    .select('vector_status')
    .eq('paper_id', testPaper.paper_id)
    .single();

  console.log('\n📊 Final Status:');
  console.log('   Vector Status:', finalPaper?.vector_status || 'unknown');

  // Verify result
  if (finalPaper?.vector_status === 'completed') {
    console.log('\n✅ SUCCESS: PDF was successfully indexed!');
    console.log('   The PDF indexing worker is working correctly.');
  } else if (finalPaper?.vector_status === 'failed') {
    console.log('\n⚠️ PARTIAL SUCCESS: Job ran but failed to index PDF');
    console.log('   Check worker logs for error details');
    console.log(
      '   This might be due to missing PDF in storage or Gemini API issues'
    );
  } else {
    console.log(
      '\n❌ FAILURE: Status did not change from',
      initialPaper?.vector_status
    );
    console.log('   Worker might not be processing jobs');
    console.log('   Check that workers are running: npm run workers');
  }

  console.log('\n=================================\n');
  process.exit(0);
}

testPdfIndexing().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
