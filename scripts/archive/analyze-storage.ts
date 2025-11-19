/**
 * Analyze storage usage for papers
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createAdminSupabaseClient } from '@/lib/supabase/server';

async function analyzePaperStorage() {
  const supabase = createAdminSupabaseClient();

  // Get collection with most papers
  const collectionId = 'e0423998-c4e5-4ec1-9a7c-53cf7d12cdcd'; // Machine Learning Papers

  console.log('📊 Analyzing storage usage...\n');

  // Get papers for this collection
  const { data: papers, error } = await supabase
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
    .eq('collection_id', collectionId);

  if (error) {
    console.error('Error:', error);
    return;
  }

  const indexedPapers =
    papers?.filter(
      p =>
        p.papers &&
        (p.papers as { vector_status?: string }).vector_status === 'completed'
    ) || [];

  console.log(`Collection: Machine Learning Papers`);
  console.log(`Total papers: ${papers?.length || 0}`);
  console.log(`Indexed papers: ${indexedPapers.length}`);
  console.log();

  // Gemini reported size
  const geminiSize = 363969246; // bytes from earlier
  const geminiSizeMB = geminiSize / (1024 * 1024);

  console.log('='.repeat(60));
  console.log('Storage Analysis');
  console.log('='.repeat(60));
  console.log(`Gemini reported size: ${geminiSizeMB.toFixed(2)} MB`);
  console.log(`Number of indexed PDFs: ${indexedPapers.length}`);
  console.log();

  // Calculate average per paper
  const avgPerPaper = geminiSizeMB / indexedPapers.length;
  console.log(
    `Average per paper (with embeddings): ${avgPerPaper.toFixed(2)} MB`
  );

  // Estimate original PDF size (divide by 3)
  const estimatedOriginalPerPaper = avgPerPaper / 3;
  console.log(
    `Estimated original PDF size: ${estimatedOriginalPerPaper.toFixed(2)} MB`
  );
  console.log();

  console.log('='.repeat(60));
  console.log('Breakdown');
  console.log('='.repeat(60));
  console.log(
    `Original PDFs (estimated): ${(geminiSizeMB / 3).toFixed(2)} MB (~33%)`
  );
  console.log(
    `Vector embeddings: ${((geminiSizeMB * 2) / 3).toFixed(2)} MB (~67%)`
  );
  console.log();

  // Calculate total original size
  const totalOriginal = geminiSizeMB / 3;
  const totalEmbeddings = geminiSizeMB - totalOriginal;

  console.log('='.repeat(60));
  console.log('Why is it 3x?');
  console.log('='.repeat(60));
  console.log('When you upload a PDF to Gemini File Search:');
  console.log(
    '  1. Original PDF is stored: ~' + totalOriginal.toFixed(0) + ' MB'
  );
  console.log('  2. PDF is chunked into smaller pieces');
  console.log('  3. Each chunk is converted to vector embedding');
  console.log(
    '  4. Embeddings are stored: ~' + totalEmbeddings.toFixed(0) + ' MB'
  );
  console.log('  5. Total = Original + Embeddings ≈ 3x original size');
  console.log();

  // Free tier analysis
  console.log('='.repeat(60));
  console.log('Free Tier Usage');
  console.log('='.repeat(60));
  const freeTierGB = 1;
  const usedGB = geminiSizeMB / 1024;
  const percentUsed = (usedGB / freeTierGB) * 100;
  const remainingGB = freeTierGB - usedGB;

  console.log(`Free tier limit: ${freeTierGB} GB`);
  console.log(
    `Currently used: ${usedGB.toFixed(3)} GB (${percentUsed.toFixed(1)}%)`
  );
  console.log(`Remaining: ${remainingGB.toFixed(3)} GB`);
  console.log();

  // Estimate max papers
  const maxPapersInFreeTier = Math.floor((freeTierGB * 1024) / avgPerPaper);
  console.log(
    `📈 You can index approximately ${maxPapersInFreeTier} papers in free tier`
  );
  console.log(
    `   (with current average of ${avgPerPaper.toFixed(2)} MB per paper)`
  );
  console.log();

  // Cost analysis
  console.log('='.repeat(60));
  console.log('Cost Analysis');
  console.log('='.repeat(60));
  console.log('Storage: FREE ✅');
  console.log('Indexing: $0.15 per 1M tokens (one-time cost when uploading)');
  console.log();

  // Rough estimate: ~1000 tokens per page, ~10 pages per paper
  const estimatedTokensPerPaper = 10000; // conservative estimate
  const totalTokens = estimatedTokensPerPaper * indexedPapers.length;
  const indexingCost = (totalTokens / 1_000_000) * 0.15;

  console.log(
    `Estimated tokens indexed: ${(totalTokens / 1_000_000).toFixed(2)}M tokens`
  );
  console.log(
    `Estimated indexing cost: $${indexingCost.toFixed(2)} (one-time)`
  );
  console.log(
    `Average cost per paper: $${(indexingCost / indexedPapers.length).toFixed(4)}`
  );
}

analyzePaperStorage().catch(console.error);
