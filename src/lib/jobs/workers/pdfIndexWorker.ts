/**
 * PDF Indexing Worker
 * Uploads PDFs to Gemini File Search Store for vector indexing
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { PdfIndexJobData } from '../queues';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { downloadPdf } from '@/lib/storage/supabaseStorage';
import { uploadPdfToStore, withRetry } from '@/lib/gemini/fileSearch';
import { PaperMetadata } from '@/lib/gemini/types';

// Worker instance
let pdfIndexWorker: Worker<PdfIndexJobData> | null = null;

/**
 * Process PDF indexing job
 */
async function processPdfIndexing(job: Job<PdfIndexJobData>) {
  const { collectionId, paperId, storageKey } = job.data;

  console.log(
    `[PDF Index Worker] Processing job ${job.id} for paper ${paperId} in collection ${collectionId}`
  );

  try {
    const supabase = createAdminSupabaseClient();

    // Step 1: Get collection's file_search_store_id
    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('file_search_store_id')
      .eq('id', collectionId)
      .single();

    if (collectionError || !collection) {
      throw new Error(
        `Collection not found: ${collectionId}. Error: ${collectionError?.message}`
      );
    }

    if (!collection.file_search_store_id) {
      throw new Error(
        `Collection ${collectionId} is missing file_search_store_id. Cannot index PDF.`
      );
    }

    console.log(
      `[PDF Index Worker] Collection ${collectionId} has File Search Store: ${collection.file_search_store_id}`
    );

    // Step 2: Get paper metadata from database
    const { data: paper, error: paperError } = await supabase
      .from('papers')
      .select('paper_id, title, authors, year, venue')
      .eq('paper_id', paperId)
      .single();

    if (paperError || !paper) {
      throw new Error(
        `Paper not found: ${paperId}. Error: ${paperError?.message}`
      );
    }

    console.log(`[PDF Index Worker] Retrieved paper metadata: ${paper.title}`);

    // Step 3: Download PDF from Supabase Storage
    console.log(
      `[PDF Index Worker] Downloading PDF from storage: ${storageKey}`
    );
    const pdfBuffer = await downloadPdf(collectionId, paperId);

    console.log(
      `[PDF Index Worker] Downloaded PDF (${pdfBuffer.length} bytes)`
    );

    // Step 4: Prepare metadata for Gemini
    // Note: Gemini File Search metadata string values must be <= 256 characters
    const authorsString = paper.authors
      ? JSON.stringify(paper.authors)
      : undefined;
    const metadata: PaperMetadata = {
      paper_id: paper.paper_id,
      title: paper.title.substring(0, 256), // Truncate to 256 chars
      authors: authorsString
        ? authorsString.substring(0, 256) // Truncate to 256 chars
        : undefined,
      year: paper.year || undefined,
      venue: paper.venue ? paper.venue.substring(0, 256) : undefined, // Truncate to 256 chars
    };

    // Step 5: Upload to Gemini File Search Store with retry logic
    console.log(
      `[PDF Index Worker] Uploading PDF to Gemini File Search Store ${collection.file_search_store_id}`
    );

    const result = await withRetry(
      () =>
        uploadPdfToStore(collection.file_search_store_id!, pdfBuffer, metadata),
      3, // max retries
      1000 // initial delay 1s
    );

    if (!result.success) {
      throw new Error(`Failed to upload to Gemini: ${result.error}`);
    }

    console.log(
      `[PDF Index Worker] Successfully indexed paper ${paperId} (File ID: ${result.fileId})`
    );

    // Step 6: Update paper status to 'completed'
    const { error: updateError } = await supabase
      .from('papers')
      .update({ vector_status: 'completed' })
      .eq('paper_id', paperId);

    if (updateError) {
      console.error(
        `[PDF Index Worker] Failed to update paper status:`,
        updateError
      );
      // Don't throw - the PDF was successfully indexed, just log the error
    }

    console.log(
      `[PDF Index Worker] Successfully processed job ${job.id} for paper ${paperId}`
    );

    return { success: true, paperId, fileId: result.fileId };
  } catch (error) {
    console.error(`[PDF Index Worker] Failed to process job ${job.id}:`, error);

    // Update paper status to 'failed'
    try {
      const supabase = createAdminSupabaseClient();
      await supabase
        .from('papers')
        .update({ vector_status: 'failed' })
        .eq('paper_id', paperId);
    } catch (updateError) {
      console.error(
        `[PDF Index Worker] Failed to update paper status to 'failed':`,
        updateError
      );
    }

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
    console.log(
      `[PDF Index Worker] Job ${job.id} completed for paper ${job.data.paperId}`
    );
    // Note: Status update is handled in processPdfIndexing function
  });

  pdfIndexWorker.on('failed', async (job, err) => {
    console.error(
      `[PDF Index Worker] Job ${job?.id} failed for paper ${job?.data.paperId}:`,
      err.message
    );
    // Note: Status update to 'failed' is handled in processPdfIndexing catch block
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
