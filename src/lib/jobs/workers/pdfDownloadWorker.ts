/**
 * PDF Download Worker
 * Downloads PDFs with fallback chain: Semantic Scholar -> ArXiv -> Unpaywall
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
import { buildArxivPdfUrl, isValidArxivId } from '@/lib/arxiv';
import { getPdfUrl as getUnpaywallPdfUrl } from '@/lib/unpaywall';

// Worker instance
let pdfDownloadWorker: Worker<PdfDownloadJobData> | null = null;

// Constants
const PDF_DOWNLOAD_TIMEOUT = 30000; // 30 seconds
const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100MB

// Download source types
type DownloadSource = 'semantic_scholar' | 'arxiv' | 'unpaywall';

interface DownloadResult {
  success: boolean;
  paperId: string;
  source?: DownloadSource;
  pdfBuffer?: Buffer;
  error?: string;
}

/**
 * Download PDF from URL with appropriate headers
 */
async function downloadPdfFromUrl(
  url: string,
  source: DownloadSource
): Promise<Buffer> {
  // Build referer based on source
  const referers: Record<DownloadSource, string> = {
    semantic_scholar: 'https://www.semanticscholar.org/',
    arxiv: 'https://arxiv.org/',
    unpaywall: '',
  };

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: PDF_DOWNLOAD_TIMEOUT,
    maxContentLength: MAX_PDF_SIZE,
    maxRedirects: 5, // Allow redirects for Unpaywall URLs
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
      ...(referers[source] && { Referer: referers[source] }),
    },
  });

  // Validate content type
  const contentType = response.headers['content-type'];
  if (contentType && !contentType.includes('application/pdf')) {
    throw new Error(
      `Invalid content type: ${contentType}. Expected application/pdf`
    );
  }

  return Buffer.from(response.data);
}

/**
 * Try downloading from Semantic Scholar (primary source)
 */
async function trySemanticScholar(pdfUrl?: string): Promise<Buffer | null> {
  if (!pdfUrl) {
    return null;
  }

  try {
    console.log(`[PDF Download] Trying Semantic Scholar: ${pdfUrl}`);
    const buffer = await downloadPdfFromUrl(pdfUrl, 'semantic_scholar');
    console.log(
      `[PDF Download] Success from Semantic Scholar (${(buffer.length / 1024).toFixed(2)} KB)`
    );
    return buffer;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`[PDF Download] Semantic Scholar failed: ${msg}`);
    return null;
  }
}

/**
 * Try downloading from ArXiv (fallback 1)
 */
async function tryArxiv(arxivId?: string): Promise<Buffer | null> {
  if (!arxivId || !isValidArxivId(arxivId)) {
    return null;
  }

  try {
    const arxivUrl = buildArxivPdfUrl(arxivId);
    console.log(`[PDF Download] Trying ArXiv: ${arxivUrl}`);
    const buffer = await downloadPdfFromUrl(arxivUrl, 'arxiv');
    console.log(
      `[PDF Download] Success from ArXiv (${(buffer.length / 1024).toFixed(2)} KB)`
    );
    return buffer;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`[PDF Download] ArXiv failed: ${msg}`);
    return null;
  }
}

/**
 * Try downloading via Unpaywall (fallback 2)
 */
async function tryUnpaywall(doi?: string): Promise<Buffer | null> {
  if (!doi) {
    return null;
  }

  try {
    console.log(`[PDF Download] Trying Unpaywall for DOI: ${doi}`);
    const unpaywallUrl = await getUnpaywallPdfUrl(doi);

    if (!unpaywallUrl) {
      console.log(`[PDF Download] Unpaywall returned no URL for DOI: ${doi}`);
      return null;
    }

    console.log(`[PDF Download] Unpaywall URL: ${unpaywallUrl}`);
    const buffer = await downloadPdfFromUrl(unpaywallUrl, 'unpaywall');
    console.log(
      `[PDF Download] Success from Unpaywall (${(buffer.length / 1024).toFixed(2)} KB)`
    );
    return buffer;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`[PDF Download] Unpaywall failed: ${msg}`);
    return null;
  }
}

/**
 * Download PDF with fallback chain
 * Order: Semantic Scholar -> ArXiv -> Unpaywall
 */
async function downloadWithFallbacks(
  data: PdfDownloadJobData
): Promise<DownloadResult> {
  const { paperId, pdfUrl, arxivId, doi } = data;

  // 1. Try Semantic Scholar (primary)
  let buffer = await trySemanticScholar(pdfUrl);
  if (buffer) {
    return {
      success: true,
      paperId,
      source: 'semantic_scholar',
      pdfBuffer: buffer,
    };
  }

  // 2. Try ArXiv (fallback 1)
  buffer = await tryArxiv(arxivId);
  if (buffer) {
    return { success: true, paperId, source: 'arxiv', pdfBuffer: buffer };
  }

  // 3. Try Unpaywall (fallback 2)
  buffer = await tryUnpaywall(doi);
  if (buffer) {
    return { success: true, paperId, source: 'unpaywall', pdfBuffer: buffer };
  }

  // All sources failed
  const triedSources: string[] = [];
  if (pdfUrl) triedSources.push('Semantic Scholar');
  if (arxivId) triedSources.push('ArXiv');
  if (doi) triedSources.push('Unpaywall');

  return {
    success: false,
    paperId,
    error: `All download sources failed. Tried: ${triedSources.join(', ') || 'none available'}`,
  };
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
  const { paperId, pdfUrl, arxivId, doi } = job.data;

  console.log(
    `[PDF Download Worker] Processing job ${job.id} for paper ${paperId}`
  );
  console.log(
    `[PDF Download Worker] Sources: pdfUrl=${!!pdfUrl}, arxivId=${arxivId || 'none'}, doi=${doi || 'none'}`
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

    // Try download with fallbacks
    const result = await downloadWithFallbacks(job.data);

    if (!result.success || !result.pdfBuffer) {
      console.error(
        `[PDF Download Worker] All download sources failed for paper ${paperId}: ${result.error}`
      );

      // Mark as failed since all sources exhausted
      try {
        await updatePaperStatus(paperId, 'failed');
      } catch (dbError) {
        console.error(
          `[PDF Download Worker] Failed to update status to failed:`,
          dbError
        );
      }

      // Throw error to mark job as failed (no retry - we tried all sources)
      throw new Error(result.error || 'All download sources failed');
    }

    console.log(
      `[PDF Download Worker] Downloaded from ${result.source} (${(result.pdfBuffer.length / 1024).toFixed(2)} KB)`
    );

    // Upload to Supabase Storage
    const storagePath = await uploadPdf(paperId, result.pdfBuffer);
    console.log(`[PDF Download Worker] Uploaded to storage: ${storagePath}`);

    // Update database status to 'processing' (ready for indexing)
    await updatePaperStatus(paperId, 'processing');
    console.log(`[PDF Download Worker] Updated paper status to 'processing'`);

    // Queue PDF indexing job
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
      `[PDF Download Worker] Successfully processed job ${job.id} for paper ${paperId} (source: ${result.source})`
    );

    return { success: true, paperId, storagePath, source: result.source };
  } catch (error) {
    // Check if this is a "all sources failed" error (no retry)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('All download sources failed')) {
      // Don't retry - we already tried all sources
      throw error;
    }

    // For other errors (network issues, etc.), BullMQ will retry
    console.error(
      `[PDF Download Worker] Failed to process job ${job.id}:`,
      error
    );
    throw error;
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
    console.log(
      `[PDF Download Worker] Job ${job.id} completed for paper ${job.data.paperId}`
    );
  });

  pdfDownloadWorker.on('failed', async (job, err) => {
    if (!job) {
      console.error('[PDF Download Worker] Job failed with no job data:', err);
      return;
    }

    console.error(
      `[PDF Download Worker] Job ${job.id} failed for paper ${job.data.paperId}:`,
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
