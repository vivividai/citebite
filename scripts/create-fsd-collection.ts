/**
 * Create FSD Autonomous Driving Collection
 *
 * This script:
 * 1. Uses AI keyword suggestion API
 * 2. Previews papers to check count
 * 3. Creates collection with all 100 papers
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { extractKeywords } from '@/lib/gemini/keyword-extraction';
import { searchWithReranking } from '@/lib/search';
import { expandQueryForReranking } from '@/lib/gemini/query-expand';
import { createCollection, linkPapersToCollection } from '@/lib/db/collections';
import {
  semanticScholarPaperToDbPaper,
  upsertPapers,
  getOpenAccessPapers,
} from '@/lib/db/papers';
import { queuePdfDownload } from '@/lib/jobs/queues';

const NATURAL_LANGUAGE_QUERY = `
I want to research Tesla's Full Self-Driving (FSD) technology and autonomous driving systems.
This includes end-to-end neural networks for autonomous vehicles, vision-based self-driving,
Level 4 and Level 5 autonomy, Tesla Autopilot architecture, and perception systems for
autonomous vehicles. Focus on recent advances in deep learning for self-driving cars.
`;

async function main() {
  console.log('🚗 Creating FSD Autonomous Driving Collection\n');
  console.log('='.repeat(60));

  // Step 1: Generate keywords using AI
  console.log('\n📝 Step 1: Generating keywords with AI...\n');
  console.log(
    'Query:',
    NATURAL_LANGUAGE_QUERY.trim().substring(0, 100) + '...\n'
  );

  const keywordSuggestion = await extractKeywords(NATURAL_LANGUAGE_QUERY);
  console.log('Generated Keywords:', keywordSuggestion.keywords);
  console.log('Reasoning:', keywordSuggestion.reasoning);
  console.log('Related Terms:', keywordSuggestion.relatedTerms?.join(', '));

  // Step 2: Expand query for better semantic matching
  console.log('\n📝 Step 2: Expanding query for semantic search...\n');
  const { expandedQuery } = await expandQueryForReranking(
    NATURAL_LANGUAGE_QUERY
  );
  console.log('Expanded Query:', expandedQuery.substring(0, 200) + '...');

  // Step 3: Preview papers
  console.log('\n📝 Step 3: Searching papers with re-ranking...\n');

  const searchResult = await searchWithReranking({
    userQuery: expandedQuery,
    searchKeywords: keywordSuggestion.keywords,
    initialLimit: 500, // Fetch more papers for re-ranking
    finalLimit: 100, // Target 100 papers
    openAccessOnly: false, // Include all papers
  });

  console.log('\n📊 Search Results:');
  console.log(`   Total papers found: ${searchResult.stats.totalSearched}`);
  console.log(
    `   Papers with embeddings: ${searchResult.stats.papersWithEmbeddings}`
  );
  console.log(`   Re-ranking applied: ${searchResult.stats.rerankingApplied}`);
  console.log(`   Final papers: ${searchResult.papers.length}`);

  // Show top 10 papers with similarity scores
  console.log('\n📄 Top 10 papers by similarity:');
  searchResult.papers.slice(0, 10).forEach((paper, i) => {
    const similarity = paper.similarity?.toFixed(4) || 'N/A';
    const isOA = paper.openAccessPdf?.url ? '🔓' : '🔒';
    console.log(
      `   ${i + 1}. [${similarity}] ${isOA} ${paper.title?.substring(0, 60)}...`
    );
  });

  // Count Open Access papers
  const openAccessPapers = getOpenAccessPapers(searchResult.papers);
  console.log(
    `\n📖 Open Access papers: ${openAccessPapers.length}/${searchResult.papers.length}`
  );

  // Step 4: Create collection in database
  console.log('\n📝 Step 4: Creating collection in database...\n');

  const supabase = createAdminSupabaseClient();

  // Check for existing user or create test context
  // For testing, we'll use the first user in the database
  const { data: users } = await supabase.from('profiles').select('id').limit(1);

  if (!users || users.length === 0) {
    console.error('❌ No users found in database. Please sign up first.');
    process.exit(1);
  }

  const userId = users[0].id;
  console.log(`Using user ID: ${userId}`);

  const collection = await createCollection(supabase, {
    name: 'FSD Autonomous Driving Research',
    search_query: keywordSuggestion.keywords,
    filters: null,
    user_id: userId,
    use_ai_assistant: true,
    natural_language_query: NATURAL_LANGUAGE_QUERY.trim(),
  });

  console.log(`✅ Collection created: ${collection.id}`);
  console.log(`   Name: ${collection.name}`);

  // Step 5: Upsert papers to database
  console.log('\n📝 Step 5: Upserting papers to database...\n');

  const dbPapers = searchResult.papers.map(semanticScholarPaperToDbPaper);
  const upsertedPaperIds = await upsertPapers(supabase, dbPapers);
  console.log(`✅ Upserted ${upsertedPaperIds.length} papers`);

  // Step 6: Link papers to collection
  console.log('\n📝 Step 6: Linking papers to collection...\n');

  await linkPapersToCollection(supabase, collection.id, upsertedPaperIds);
  console.log(`✅ Linked ${upsertedPaperIds.length} papers to collection`);

  // Step 7: Queue PDF downloads for Open Access papers
  console.log('\n📝 Step 7: Queueing PDF downloads...\n');

  let queuedCount = 0;
  for (const paper of openAccessPapers) {
    if (!paper.openAccessPdf?.url) continue;

    const jobId = await queuePdfDownload({
      collectionId: collection.id,
      paperId: paper.paperId,
      pdfUrl: paper.openAccessPdf.url,
    });

    if (jobId) {
      queuedCount++;
    }
  }

  console.log(`✅ Queued ${queuedCount} PDF downloads`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✨ Collection Creation Complete!\n');
  console.log(`📁 Collection ID: ${collection.id}`);
  console.log(`📚 Total Papers: ${upsertedPaperIds.length}`);
  console.log(`🔓 Open Access: ${openAccessPapers.length}`);
  console.log(`📥 PDF Downloads Queued: ${queuedCount}`);
  console.log('\n💡 Run "npm run workers" to process PDF downloads');
}

main().catch(console.error);
