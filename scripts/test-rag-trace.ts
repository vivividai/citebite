/**
 * Test RAG query with API trace enabled
 *
 * This script tests the RAG system and captures the full API trace
 * to docs/info/rag-api-trace.md
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { queryRAG } from '@/lib/rag';

async function main() {
  const supabase = createAdminSupabaseClient();
  const collectionId = '20584ca6-52e8-4a6d-b432-05a6cea33131';

  console.log('🔍 Checking collection and papers...\n');

  // Check papers in collection via collection_papers join table
  const { data: collectionPapers, error: papersError } = await supabase
    .from('collection_papers')
    .select('paper_id, papers(paper_id, title, vector_status)')
    .eq('collection_id', collectionId);

  const papers = collectionPapers?.map(cp => cp.papers).filter(Boolean) || [];

  if (papersError) {
    console.error('Error fetching papers:', papersError);
    return;
  }

  console.log(`📚 Found ${papers?.length || 0} papers in collection`);

  const indexedPapers =
    papers?.filter(p => p.vector_status === 'completed') || [];
  console.log(
    `✅ ${indexedPapers.length} papers indexed (vector_status: completed)\n`
  );

  if (indexedPapers.length === 0) {
    console.error('❌ No indexed papers found. Please index papers first.');
    return;
  }

  // Show paper titles
  console.log('📄 Indexed papers:');
  indexedPapers.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.title?.substring(0, 60)}...`);
  });
  console.log();

  // Run RAG query with trace enabled
  const query = 'tell me about mram development';
  console.log(`🚀 Running RAG query: "${query}"`);
  console.log('📝 API trace will be saved to docs/info/rag-api-trace.md\n');

  try {
    const response = await queryRAG(
      collectionId,
      query,
      [], // No conversation history
      true // Enable API trace
    );

    console.log('\n' + '='.repeat(60));
    console.log('RAG Response Summary:');
    console.log('='.repeat(60));
    console.log(`Answer length: ${response.answer.length} characters`);
    console.log(`Grounding chunks: ${response.groundingChunks.length}`);
    console.log(`Grounding supports: ${response.groundingSupports.length}`);
    console.log('\n📄 Answer preview:');
    console.log(response.answer.substring(0, 500) + '...');
    console.log('\n✅ API trace saved to docs/info/rag-api-trace.md');
  } catch (error) {
    console.error('❌ RAG query failed:', error);
  }
}

main().catch(console.error);
