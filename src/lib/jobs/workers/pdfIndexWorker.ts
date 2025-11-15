/**
 * PDF Indexing Worker
 * Uploads PDFs to Gemini File Search Store for vector indexing
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { PdfIndexJobData } from '../queues';

// Worker instance
let pdfIndexWorker: Worker<PdfIndexJobData> | null = null;

/**
 * Process PDF indexing job
 */
async function processPdfIndexing(job: Job<PdfIndexJobData>) {
  const { paperId } = job.data;

  console.log(
    `[PDF Index Worker] Processing job ${job.id} for paper ${paperId}`
  );

  try {
    // TODO: Implement in Phase 2
    // 1. Get collection's file_search_store_id from database using job.data.collectionId
    // 2. Retrieve PDF from Supabase Storage using job.data.storageKey
    // 3. Get paper metadata from database
    // 4. Upload PDF to Gemini File Search Store with metadata
    // 5. Update Paper.vectorStatus to 'completed'

    // Placeholder for now
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(
      `[PDF Index Worker] Successfully processed job ${job.id} for paper ${paperId}`
    );

    return { success: true, paperId };
  } catch (error) {
    console.error(`[PDF Index Worker] Failed to process job ${job.id}:`, error);
    throw error; // BullMQ will handle retries
  }
}

/**
 * Start PDF indexing worker
 */
export function startPdfIndexWorker(): Worker<PdfIndexJobData> | null {
  if (!process.env.REDIS_URL) {
    console.warn(
      'REDIS_URL not configured. PDF indexing worker will not start.'
    );
    return null;
  }

  if (pdfIndexWorker) {
    console.log('PDF indexing worker already running');
    return pdfIndexWorker;
  }

  const connection = getRedisClient();
  if (!connection) {
    return null;
  }

  pdfIndexWorker = new Worker<PdfIndexJobData>(
    'pdf-indexing',
    processPdfIndexing,
    {
      connection,
      concurrency: 3, // Lower concurrency due to Gemini API rate limits
      limiter: {
        max: 5, // Max 5 jobs
        duration: 1000, // Per second
      },
    }
  );

  // Event handlers
  pdfIndexWorker.on('completed', async job => {
    console.log(`[PDF Index Worker] Job ${job.id} completed`);

    // TODO: Update database status to 'completed'
    // const supabase = createServerSupabaseClient();
    // await supabase
    //   .from('papers')
    //   .update({ vector_status: 'completed' })
    //   .eq('paper_id', job.data.paperId);
  });

  pdfIndexWorker.on('failed', async (job, err) => {
    console.error(`[PDF Index Worker] Job ${job?.id} failed:`, err);

    // TODO: Update database status to 'failed'
    // const supabase = createServerSupabaseClient();
    // await supabase
    //   .from('papers')
    //   .update({ vector_status: 'failed' })
    //   .eq('paper_id', job!.data.paperId);
  });

  pdfIndexWorker.on('error', err => {
    console.error('[PDF Index Worker] Worker error:', err);
  });

  console.log('PDF indexing worker started');
  return pdfIndexWorker;
}

/**
 * Stop PDF indexing worker
 */
export async function stopPdfIndexWorker(): Promise<void> {
  if (pdfIndexWorker) {
    await pdfIndexWorker.close();
    pdfIndexWorker = null;
    console.log('PDF indexing worker stopped');
  }
}
