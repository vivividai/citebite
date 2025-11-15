/**
 * Insight Generation Worker
 * Generates research insights from collection papers using Gemini
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { InsightGenerationJobData } from '../queues';

// Worker instance
let insightWorker: Worker<InsightGenerationJobData> | null = null;

/**
 * Process insight generation job
 */
async function processInsightGeneration(job: Job<InsightGenerationJobData>) {
  const { collectionId } = job.data;

  console.log(
    `[Insight Worker] Processing job ${job.id} for collection ${collectionId}`
  );

  try {
    // TODO: Implement in Phase 6
    // 1. Fetch all papers in the collection from database
    // 2. Aggregate paper abstracts and metadata
    // 3. Create Gemini prompt for trend analysis
    // 4. Parse and validate Gemini response
    // 5. Extract top papers by citation count
    // 6. Save insights to Collection.insightSummary (JSONB)
    // 7. Update Collection.lastInsightGeneratedAt

    // Placeholder for now
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(
      `[Insight Worker] Successfully processed job ${job.id} for collection ${collectionId}`
    );

    return { success: true, collectionId };
  } catch (error) {
    console.error(`[Insight Worker] Failed to process job ${job.id}:`, error);
    throw error; // BullMQ will handle retries
  }
}

/**
 * Start insight generation worker
 */
export function startInsightWorker(): Worker<InsightGenerationJobData> | null {
  if (!process.env.REDIS_URL) {
    console.warn(
      'REDIS_URL not configured. Insight generation worker will not start.'
    );
    return null;
  }

  if (insightWorker) {
    console.log('Insight generation worker already running');
    return insightWorker;
  }

  const connection = getRedisClient();
  if (!connection) {
    return null;
  }

  insightWorker = new Worker<InsightGenerationJobData>(
    'insight-generation',
    processInsightGeneration,
    {
      connection,
      concurrency: 1, // Process one at a time (resource intensive)
      limiter: {
        max: 2, // Max 2 jobs
        duration: 60000, // Per minute
      },
    }
  );

  // Event handlers
  insightWorker.on('completed', async job => {
    console.log(`[Insight Worker] Job ${job.id} completed`);

    // TODO: No additional database update needed (done in processor)
  });

  insightWorker.on('failed', async (job, err) => {
    console.error(`[Insight Worker] Job ${job?.id} failed:`, err);

    // TODO: Optionally log failure to database or notify user
  });

  insightWorker.on('error', err => {
    console.error('[Insight Worker] Worker error:', err);
  });

  console.log('Insight generation worker started');
  return insightWorker;
}

/**
 * Stop insight generation worker
 */
export async function stopInsightWorker(): Promise<void> {
  if (insightWorker) {
    await insightWorker.close();
    insightWorker = null;
    console.log('Insight generation worker stopped');
  }
}
