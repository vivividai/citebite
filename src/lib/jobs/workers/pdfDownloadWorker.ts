/**
 * PDF Download Worker
 * Downloads PDFs from Semantic Scholar and uploads to Supabase Storage
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { PdfDownloadJobData } from '../queues';

// Worker instance
let pdfDownloadWorker: Worker<PdfDownloadJobData> | null = null;

/**
 * Process PDF download job
 */
async function processPdfDownload(job: Job<PdfDownloadJobData>) {
  const { paperId } = job.data;

  console.log(
    `[PDF Download Worker] Processing job ${job.id} for paper ${paperId}`
  );

  try {
    // TODO: Implement in Phase 2
    // 1. Download PDF from job.data.pdfUrl using axios
    // 2. Upload to Supabase Storage
    // 3. Update Paper.pdfUrl and Paper.storageKey in database
    // 4. Queue PDF indexing job

    // Placeholder for now
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(
      `[PDF Download Worker] Successfully processed job ${job.id} for paper ${paperId}`
    );

    return { success: true, paperId };
  } catch (error) {
    console.error(
      `[PDF Download Worker] Failed to process job ${job.id}:`,
      error
    );
    throw error; // BullMQ will handle retries
  }
}

/**
 * Start PDF download worker
 */
export function startPdfDownloadWorker(): Worker<PdfDownloadJobData> | null {
  if (!process.env.REDIS_URL) {
    console.warn(
      'REDIS_URL not configured. PDF download worker will not start.'
    );
    return null;
  }

  if (pdfDownloadWorker) {
    console.log('PDF download worker already running');
    return pdfDownloadWorker;
  }

  const connection = getRedisClient();
  if (!connection) {
    return null;
  }

  pdfDownloadWorker = new Worker<PdfDownloadJobData>(
    'pdf-download',
    processPdfDownload,
    {
      connection,
      concurrency: 5, // Process up to 5 downloads concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 1000, // Per second
      },
    }
  );

  // Event handlers
  pdfDownloadWorker.on('completed', async job => {
    console.log(`[PDF Download Worker] Job ${job.id} completed`);

    // TODO: Update database status to 'processing' (ready for indexing)
    // const supabase = createServerSupabaseClient();
    // await supabase
    //   .from('papers')
    //   .update({ vector_status: 'processing' })
    //   .eq('paper_id', job.data.paperId);
  });

  pdfDownloadWorker.on('failed', async (job, err) => {
    console.error(`[PDF Download Worker] Job ${job?.id} failed:`, err);

    // TODO: Update database status to 'failed'
    // const supabase = createServerSupabaseClient();
    // await supabase
    //   .from('papers')
    //   .update({ vector_status: 'failed' })
    //   .eq('paper_id', job!.data.paperId);
  });

  pdfDownloadWorker.on('error', err => {
    console.error('[PDF Download Worker] Worker error:', err);
  });

  console.log('PDF download worker started');
  return pdfDownloadWorker;
}

/**
 * Stop PDF download worker
 */
export async function stopPdfDownloadWorker(): Promise<void> {
  if (pdfDownloadWorker) {
    await pdfDownloadWorker.close();
    pdfDownloadWorker = null;
    console.log('PDF download worker stopped');
  }
}
