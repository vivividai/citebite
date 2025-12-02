/**
 * Test RAG query with API trace enabled
 *
 * This script tests the RAG system and captures the full API trace
 * to docs/info/rag-api-trace.md
 *
 * It also validates source mapping between citations in the response
 * and the actual grounding chunks to detect any mismatches.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { queryRAG } from '@/lib/rag';

// Configuration - edit these values for testing
const TEST_CONFIG = {
  // Full Self-Driving collection
  collectionId: '5b186709-9f07-4e99-9917-3370018b0930',
  query:
    'tell me about what does full self driving means, and how did it improved until now',
  // Model to use: 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-pro-preview'
  model: 'gemini-2.5-pro' as const,
};

async function main() {
  const supabase = createAdminSupabaseClient();
  const { collectionId, query, model } = TEST_CONFIG;

  console.log('🔍 Checking collection and papers...\n');
  console.log(`📋 Collection ID: ${collectionId}`);
  console.log(`❓ Query: "${query}"`);
  console.log(`🤖 Model: ${model}\n`);

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
  console.log('📄 Indexed papers (first 10):');
  indexedPapers.slice(0, 10).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.title?.substring(0, 60)}...`);
  });
  if (indexedPapers.length > 10) {
    console.log(`   ... and ${indexedPapers.length - 10} more`);
  }
  console.log();

  // Run RAG query with trace enabled
  console.log(`🚀 Running RAG query...`);
  console.log('📝 API trace will be saved to docs/info/rag-api-trace.md\n');

  try {
    const response = await queryRAG(
      collectionId,
      query,
      [], // No conversation history
      true, // Enable API trace
      model
    );

    console.log('\n' + '='.repeat(80));
    console.log('RAG Response Summary:');
    console.log('='.repeat(80));
    console.log(`Answer length: ${response.answer.length} characters`);
    console.log(`Grounding chunks: ${response.groundingChunks.length}`);
    console.log(`Grounding supports: ${response.groundingSupports.length}`);

    // Validate source mapping
    console.log('\n' + '='.repeat(80));
    console.log('Source Mapping Validation:');
    console.log('='.repeat(80));

    // Extract [N] citations from the answer
    const citationRegex = /\[(\d+)\]/g;
    const citationsInAnswer = new Set<number>();
    let match;
    while ((match = citationRegex.exec(response.answer)) !== null) {
      citationsInAnswer.add(parseInt(match[1], 10));
    }

    console.log(
      `\n📌 Citations found in answer: [${Array.from(citationsInAnswer)
        .sort((a, b) => a - b)
        .join(', ')}]`
    );
    console.log(
      `📦 Grounding chunks available: ${response.groundingChunks.length}`
    );

    // Show grounding chunks with their paper info
    console.log('\n📊 Grounding Chunks Detail:');
    response.groundingChunks.forEach((chunk, i) => {
      const sourceNum = i + 1;
      const isUsed = citationsInAnswer.has(sourceNum);
      const status = isUsed ? '✅ CITED' : '⚪ NOT CITED';
      const paperId = chunk.retrievedContext?.paper_id || chunk.paper_id;
      const text = chunk.retrievedContext?.text || chunk.text;
      console.log(`\n[${sourceNum}] ${status}`);
      console.log(`    Paper ID: ${paperId}`);
      console.log(`    Content preview: ${text?.substring(0, 100)}...`);
    });

    // Check for citation number mismatches
    console.log('\n' + '='.repeat(80));
    console.log('Citation Mapping Analysis:');
    console.log('='.repeat(80));

    const maxChunkIndex = response.groundingChunks.length;
    const outOfRangeCitations = Array.from(citationsInAnswer).filter(
      n => n > maxChunkIndex || n < 1
    );

    if (outOfRangeCitations.length > 0) {
      console.log(
        `\n⚠️  WARNING: Citations out of range: [${outOfRangeCitations.join(', ')}]`
      );
      console.log(`    Valid range: [1] to [${maxChunkIndex}]`);
    } else {
      console.log('\n✅ All citations are within valid range');
    }

    // Show grounding supports mapping
    console.log('\n📎 Grounding Supports (LLM → Source mapping):');
    response.groundingSupports.slice(0, 10).forEach((support, i) => {
      const text = support.segment?.text || 'N/A';
      const indices = support.groundingChunkIndices || [];
      console.log(`   ${i + 1}. "${text}" → chunks: [${indices.join(', ')}]`);
    });
    if (response.groundingSupports.length > 10) {
      console.log(`   ... and ${response.groundingSupports.length - 10} more`);
    }

    // Print answer preview
    console.log('\n' + '='.repeat(80));
    console.log('Answer Preview (first 1000 chars):');
    console.log('='.repeat(80));
    console.log(response.answer.substring(0, 1000) + '...');

    console.log('\n✅ API trace saved to docs/info/rag-api-trace.md');
  } catch (error) {
    console.error('❌ RAG query failed:', error);
  }
}

main().catch(console.error);
