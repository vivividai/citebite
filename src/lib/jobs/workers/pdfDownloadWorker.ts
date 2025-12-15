/**
 * PDF Download Worker
 * Downloads PDFs from Semantic Scholar and uploads to Supabase Storage
 *
 * PDFs are stored once per paper (not per collection) to prevent duplicates.
 * If PDF already exists, download is skipped.
 */

import { Worker, Job } from 'bullmq';
import axios from 'axios';
import { getRedisClient } from '@/lib/redis/client';
import { PdfDownloadJobData, queuePdfIndexing } from '../queues';
import {
  uploadPdf,
  getStoragePath,
  pdfExists,
} from '@/lib/storage/supabaseStorage';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

// Worker instance
let pdfDownloadWorker: Worker<PdfDownloadJobData> | null = null;

// Constants
const PDF_DOWNLOAD_TIMEOUT = 30000; // 30 seconds
const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Download PDF from URL
 */
async function downloadPdfFromUrl(url: string): Promise<Buffer> {
  // Use browser-like headers to avoid bot detection
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: PDF_DOWNLOAD_TIMEOUT,
    maxContentLength: MAX_PDF_SIZE,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      // Add Referer based on URL domain to appear more legitimate
      ...(url.includes('semanticscholar.org') && {
        Referer: 'https://www.semanticscholar.org/',
      }),
      ...(url.includes('arxiv.org') && {
        Referer: 'https://arxiv.org/',
      }),
    },
  });

  // Validate content type
  const contentType = response.headers['content-type'];
  if (contentType && !contentType.includes('application/pdf')) {
    throw new Error(
      `Invalid content type: ${contentType}. Expected application/pdf`
    );
  }

  // Convert to Buffer
  return Buffer.from(response.data);
}

/**
 * Update paper status in database
 */
async function updatePaperStatus(
  paperId: string,
  status: 'processing' | 'failed'
): Promise<void> {
  const supabase = createAdminSupabaseClient();

  // Type assertion needed until migration is applied and types are regenerated
  const { error } = await supabase
    .from('papers')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ text_vector_status: status } as any)
    .eq('paper_id', paperId);

  if (error) {
    console.error(
      `Failed to update paper ${paperId} status to ${status}:`,
      error
    );
    throw new Error(`Database update failed: ${error.message}`);
  }
}

/**
 * Process PDF download job
 */
async function processPdfDownload(job: Job<PdfDownloadJobData>) {
  const { paperId, pdfUrl } = job.data;

  console.log(
    `[PDF Download Worker] Processing job ${job.id} for paper ${paperId}`
  );

  try {
    // Check if PDF already exists (skip duplicate downloads)
    const alreadyExists = await pdfExists(paperId);
    if (alreadyExists) {
      console.log(
        `[PDF Download Worker] PDF already exists for paper ${paperId}, skipping download`
      );

      // Still queue indexing job in case it wasn't indexed yet
      const storageKey = getStoragePath(paperId);
      const indexJobId = await queuePdfIndexing({
        paperId,
        storageKey,
      });

      if (indexJobId) {
        console.log(`[PDF Download Worker] Queued indexing job: ${indexJobId}`);
      }

      return { success: true, paperId, skipped: true };
    }

    console.log(`[PDF Download Worker] Downloading from: ${pdfUrl}`);

    // Step 1: Download PDF from Semantic Scholar
    const pdfBuffer = await downloadPdfFromUrl(pdfUrl);
    console.log(
      `[PDF Download Worker] Downloaded PDF (${(pdfBuffer.length / 1024).toFixed(2)} KB)`
    );

    // Step 2: Upload to Supabase Storage
    const storagePath = await uploadPdf(paperId, pdfBuffer);
    console.log(`[PDF Download Worker] Uploaded to storage: ${storagePath}`);

    // Step 3: Update database status to 'processing' (ready for indexing)
    await updatePaperStatus(paperId, 'processing');
    console.log(`[PDF Download Worker] Updated paper status to 'processing'`);

    // Step 4: Queue PDF indexing job
    const storageKey = getStoragePath(paperId);
    const indexJobId = await queuePdfIndexing({
      paperId,
      storageKey,
    });

    if (indexJobId) {
      console.log(`[PDF Download Worker] Queued indexing job: ${indexJobId}`);
    } else {
      console.warn(
        `[PDF Download Worker] Failed to queue indexing job for paper ${paperId}`
      );
    }

    console.log(
      `[PDF Download Worker] Successfully processed job ${job.id} for paper ${paperId}`
    );

    return { success: true, paperId, storagePath };
  } catch (error) {
    // Determine if error is retryable
    const isRetryable = isRetryableError(error);

    console.error(
      `[PDF Download Worker] Failed to process job ${job.id} (retryable: ${isRetryable}):`,
      error
    );

    if (!isRetryable) {
      // Mark as failed immediately for non-retryable errors
      try {
        await updatePaperStatus(paperId, 'failed');
      } catch (dbError) {
        console.error(
          `[PDF Download Worker] Failed to update status to failed:`,
          dbError
        );
      }
    }

    throw error; // BullMQ will handle retries
  }
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    // Don't retry on 404 (not found) or 403 (forbidden)
    if (status === 404 || status === 403) {
      return false;
    }

    // Don't retry on 400 (bad request)
    if (status === 400) {
      return false;
    }

    // Retry on network errors, timeouts, and 5xx errors
    return true;
  }

  // Retry on unknown errors
  return true;
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
    console.log(
      `[PDF Download Worker] Job ${job.id} completed for paper ${job.data.paperId}`
    );
    // Status is already updated to 'processing' in the processPdfDownload function
  });

  pdfDownloadWorker.on('failed', async (job, err) => {
    if (!job) {
      console.error('[PDF Download Worker] Job failed with no job data:', err);
      return;
    }

    console.error(
      `[PDF Download Worker] Job ${job.id} failed after all retries for paper ${job.data.paperId}:`,
      err
    );

    // Update database status to 'failed' if not already done
    try {
      const supabase = createAdminSupabaseClient();
      const { error } = await supabase
        .from('papers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ text_vector_status: 'failed' } as any)
        .eq('paper_id', job.data.paperId);

      if (error) {
        console.error(
          `[PDF Download Worker] Failed to update paper ${job.data.paperId} status to failed:`,
          error
        );
      } else {
        console.log(
          `[PDF Download Worker] Updated paper ${job.data.paperId} status to 'failed'`
        );
      }
    } catch (error) {
      console.error(
        '[PDF Download Worker] Error updating failed status:',
        error
      );
    }
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
