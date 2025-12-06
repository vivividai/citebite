#!/usr/bin/env npx tsx
/**
 * QASPER RAG Evaluation CLI
 *
 * Evaluates the CiteBite Custom RAG system using the QASPER dataset.
 *
 * Usage:
 *   npm run eval:qasper                         # Full evaluation (json mode, default)
 *   npm run eval:qasper -- --mode=pdf           # PDF pipeline mode (tests chunking)
 *   npm run eval:qasper -- --mode=json          # Direct JSON text mode (faster)
 *   npm run eval:qasper -- --limit=5            # Quick test with 5 papers
 *   npm run eval:qasper -- --resume             # Resume from checkpoint
 *   npm run eval:qasper -- --skip-ingest --collection=<uuid>
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

import {
  loadQasperDataset,
  getDatasetStats,
  filterPapersWithQAs,
} from './load-dataset';
import { ingestQasperPapers, getOrCreateEvalCollection } from './ingest-papers';
import {
  ingestQasperPapersDirect,
  getOrCreateDirectEvalCollection,
  getIndexedPaperCount,
} from './direct-ingest';
import { waitForIndexing, checkIndexingProgress } from './wait-indexing';
import { runEvaluation, formatProgress } from './run-evaluation';
import { generateReport } from './report';
import { deleteCheckpoint } from './checkpoint';

type IngestionMode = 'pdf' | 'json';

// Parse command line arguments
function parseArgs(): {
  limit?: number;
  resume: boolean;
  skipIngest: boolean;
  collectionId?: string;
  mode: IngestionMode;
} {
  const args = process.argv.slice(2);
  const result = {
    limit: undefined as number | undefined,
    resume: false,
    skipIngest: false,
    collectionId: undefined as string | undefined,
    mode: 'json' as IngestionMode, // Default to json mode (faster)
  };

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      result.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--resume') {
      result.resume = true;
    } else if (arg === '--skip-ingest') {
      result.skipIngest = true;
    } else if (arg.startsWith('--collection=')) {
      result.collectionId = arg.split('=')[1];
    } else if (arg.startsWith('--mode=')) {
      const mode = arg.split('=')[1];
      if (mode === 'pdf' || mode === 'json') {
        result.mode = mode;
      } else {
        console.error(`Invalid mode: ${mode}. Use 'pdf' or 'json'`);
        process.exit(1);
      }
    }
  }

  return result;
}

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║     QASPER RAG Evaluation                      ║');
  console.log('║     CiteBite Custom RAG System                 ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const args = parseArgs();
  const startTime = Date.now();

  // Show mode
  console.log(`Mode: ${args.mode.toUpperCase()}`);
  if (args.mode === 'pdf') {
    console.log(
      '  → PDF download + chunking pipeline (tests full RAG pipeline)'
    );
  } else {
    console.log(
      '  → Direct JSON text ingestion (faster, for LLM response eval)'
    );
  }
  console.log('');

  // Check for required environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY',
  ];

  // PDF mode also requires Redis for workers
  if (args.mode === 'pdf') {
    requiredEnvVars.push('REDIS_URL');
  }

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }

  // ============================================================
  // PHASE 1: Load Dataset
  // ============================================================
  console.log('📚 Phase 1: Loading QASPER dataset...\n');

  let papers = await loadQasperDataset(undefined, args.limit);
  papers = filterPapersWithQAs(papers);

  const stats = getDatasetStats(papers);
  console.log(
    `Loaded ${stats.totalPapers} papers with ${stats.totalQuestions} questions`
  );
  console.log(`Average questions per paper: ${stats.avgQuestionsPerPaper}`);
  console.log(`Answer types:`, stats.answerTypes);
  console.log('');

  // ============================================================
  // PHASE 2: Paper Ingestion
  // ============================================================
  let collectionId: string;

  if (args.skipIngest && args.collectionId) {
    collectionId = args.collectionId;
    console.log(`📁 Using existing collection: ${collectionId}\n`);
  } else if (args.mode === 'json') {
    // Direct JSON text ingestion
    console.log('📥 Phase 2: Ingesting papers (direct text mode)...\n');

    collectionId = await getOrCreateDirectEvalCollection();
    console.log(`Collection ID: ${collectionId}`);

    // Check if already indexed
    const existingStatus = await getIndexedPaperCount(collectionId);
    if (existingStatus.completed >= papers.length) {
      console.log(`\n✓ All ${existingStatus.completed} papers already indexed`);
    } else {
      const ingestionResult = await ingestQasperPapersDirect(
        papers,
        collectionId,
        (current, total, status) => {
          process.stdout.write(`\r[${current}/${total}] ${status.padEnd(50)}`);
        }
      );

      console.log('\n');
      console.log(
        `Processed: ${papers.length - ingestionResult.failed.length} papers`
      );
      console.log(`Failed: ${ingestionResult.failed.length} papers`);

      if (ingestionResult.failed.length > 0) {
        console.log(
          `Failed paper IDs: ${ingestionResult.failed.slice(0, 5).join(', ')}${ingestionResult.failed.length > 5 ? '...' : ''}`
        );
      }
    }
    console.log('');
  } else {
    // PDF pipeline mode
    console.log('📥 Phase 2: Ingesting papers (PDF pipeline mode)...\n');

    collectionId = await getOrCreateEvalCollection();
    console.log(`Collection ID: ${collectionId}`);

    const ingestionResult = await ingestQasperPapers(
      papers,
      collectionId,
      (current, total) => {
        process.stdout.write(`\rIngesting papers: ${current}/${total}`);
      }
    );

    console.log('\n');
    console.log(`Queued: ${ingestionResult.queued} papers`);
    console.log(`Failed: ${ingestionResult.failed.length} papers`);

    if (ingestionResult.failed.length > 0) {
      console.log(
        `Failed paper IDs: ${ingestionResult.failed.slice(0, 5).join(', ')}${ingestionResult.failed.length > 5 ? '...' : ''}`
      );
    }
    console.log('');

    // ============================================================
    // PHASE 3: Wait for Indexing (PDF mode only)
    // ============================================================
    if (ingestionResult.queued > 0) {
      console.log('⏳ Phase 3: Waiting for PDF indexing...\n');
      console.log('NOTE: Make sure workers are running (npm run workers)');

      await waitForIndexing(collectionId, {
        pollIntervalMs: 5000,
        timeoutMs: 3600000, // 1 hour
      });
    } else {
      // Quick check for existing papers
      const progress = await checkIndexingProgress(collectionId);
      console.log(
        `📊 Indexing status: ${progress.completed}/${progress.total} completed (${progress.failed} failed)\n`
      );
    }
  }

  // ============================================================
  // PHASE 4: Run Evaluation
  // ============================================================
  console.log('🔍 Phase 4: Running RAG evaluation...\n');

  const results = await runEvaluation(collectionId, papers, {
    resume: args.resume,
    checkpointInterval: 50,
    requestDelayMs: 100,
    onProgress: (current, total, lastResult) => {
      const line = formatProgress(current, total, lastResult);
      process.stdout.write(`\r${line}`);
    },
  });

  console.log('\n');

  // ============================================================
  // PHASE 5: Generate Report
  // ============================================================
  console.log('📊 Phase 5: Generating report...\n');

  const runtimeMs = Date.now() - startTime;

  const resultPath = generateReport(results, {
    collectionId,
    model: `gemini-2.5-flash (${args.mode} mode)`,
    totalPapers: papers.length,
    runtimeMs,
  });

  // Clean up checkpoint on success
  deleteCheckpoint(collectionId);

  console.log('\n✅ Evaluation complete!');
  console.log(`Results saved to: ${resultPath}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Evaluation interrupted. Progress saved to checkpoint.');
  console.log('Run with --resume to continue.');
  process.exit(0);
});

// Run
main().catch(error => {
  console.error('\n❌ Evaluation failed:', error);
  process.exit(1);
});
