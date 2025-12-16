/**
 * PDF Indexing Worker - Custom RAG with pgvector (Text Only)
 *
 * Extracts text from PDFs, chunks them, generates embeddings,
 * and stores in pgvector for hybrid search.
 *
 * Chunks are stored once per paper (not per collection) to prevent duplicates.
 * If paper is already indexed, indexing is skipped.
 *
 * Note: Figure/image processing is handled by the separate figureAnalysisWorker.
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { PdfIndexJobData, queueFigureAnalysis } from '../queues';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { downloadPdf } from '@/lib/storage/supabaseStorage';
import { extractTextFromPdf } from '@/lib/pdf/extractor';
import { chunkTextWithFigureRefs } from '@/lib/rag/chunker';
import { generateDocumentEmbeddings } from '@/lib/rag/embeddings';
import {
  insertChunksWithFigureRefs,
  deleteChunksForPaper,
  isPaperIndexed,
} from '@/lib/db/chunks';
import { getStoragePath } from '@/lib/storage/supabaseStorage';

// Worker instance
let pdfIndexWorker: Worker<PdfIndexJobData> | null = null;

/**
 * Process PDF indexing job (text only)
 *
 * Pipeline:
 * 1. Check if paper already indexed (skip if so)
 * 2. Download PDF from Supabase Storage
 * 3. Extract text using pdf-parse
 * 4. Chunk text with figure reference extraction
 * 5. Generate embeddings and insert text chunks
 * 6. Update text_vector_status to 'completed'
 * 7. Queue figure analysis job (separate worker)
 */
async function processPdfIndexing(job: Job<PdfIndexJobData>) {
  const { paperId, storageKey } = job.data;

  console.log(
    `[PDF Index Worker] Processing job ${job.id} for paper ${paperId}`
  );

  try {
    const supabase = createAdminSupabaseClient();

    // Step 0: Check if paper already indexed (skip duplicates)
    const alreadyIndexed = await isPaperIndexed(paperId);
    if (alreadyIndexed) {
      console.log(
        `[PDF Index Worker] Paper ${paperId} already indexed, skipping`
      );

      // Update status to completed if not already
      await supabase
        .from('papers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ text_vector_status: 'completed' } as any)
        .eq('paper_id', paperId);

      // Still queue figure analysis in case it wasn't done
      const figureJobId = await queueFigureAnalysis({
        paperId,
        storageKey: storageKey || getStoragePath(paperId),
      });

      if (figureJobId) {
        console.log(
          `[PDF Index Worker] Queued figure analysis job: ${figureJobId}`
        );
      }

      return { success: true, paperId, skipped: true };
    }

    // Step 1: Download PDF from Supabase Storage
    console.log(`[PDF Index Worker] Downloading PDF from storage...`);
    await job.updateProgress(5);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await downloadPdf(paperId);
    } catch (error) {
      throw new Error(
        `Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    console.log(
      `[PDF Index Worker] Downloaded PDF (${pdfBuffer.length} bytes)`
    );

    // Step 2: Extract text from PDF
    console.log(`[PDF Index Worker] Extracting text from PDF...`);
    await job.updateProgress(10);

    const { text, numPages } = await extractTextFromPdf(pdfBuffer);

    if (!text || text.length < 100) {
      throw new Error(
        `PDF text extraction failed or content too short (${text?.length || 0} chars)`
      );
    }

    console.log(
      `[PDF Index Worker] Extracted ${text.length} chars from ${numPages} pages`
    );

    // Step 3: Chunk text WITH figure references
    console.log(
      `[PDF Index Worker] Chunking text with figure reference extraction...`
    );
    await job.updateProgress(15);

    const chunks = chunkTextWithFigureRefs(text);

    if (chunks.length === 0) {
      throw new Error('No chunks generated from PDF text');
    }

    const chunksWithRefs = chunks.filter(
      c => c.referencedFigures.length > 0
    ).length;
    console.log(
      `[PDF Index Worker] Created ${chunks.length} chunks (${chunksWithRefs} with figure references)`
    );

    // Step 4: Generate embeddings (batched)
    console.log(`[PDF Index Worker] Generating embeddings for text chunks...`);
    await job.updateProgress(25);

    const embeddings = await generateDocumentEmbeddings(
      chunks.map(c => c.content)
    );

    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: got ${embeddings.length}, expected ${chunks.length}`
      );
    }

    console.log(`[PDF Index Worker] Generated ${embeddings.length} embeddings`);

    // Step 5: Delete existing chunks (for re-indexing support)
    console.log(`[PDF Index Worker] Clearing existing chunks...`);
    await job.updateProgress(30);

    await deleteChunksForPaper(paperId);

    // Step 6: Insert text chunks into pgvector
    console.log(`[PDF Index Worker] Inserting text chunks into pgvector...`);
    await job.updateProgress(35);

    await insertChunksWithFigureRefs(
      chunks.map((chunk, i) => ({
        paperId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
        embedding: embeddings[i],
        referencedFigures: chunk.referencedFigures,
      }))
    );

    // Step 7: Update text_vector_status to 'completed'
    console.log(`[PDF Index Worker] Updating paper text_vector_status...`);
    await job.updateProgress(90);

    // Type assertion needed until migration is applied and types are regenerated
    const { error: updateError } = await supabase
      .from('papers')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ text_vector_status: 'completed' } as any)
      .eq('paper_id', paperId);

    if (updateError) {
      console.error(
        `[PDF Index Worker] Failed to update paper status:`,
        updateError
      );
      // Don't throw - chunks are already indexed
    }

    // Step 8: Queue figure analysis job (separate worker)
    console.log(`[PDF Index Worker] Queueing figure analysis job...`);
    await job.updateProgress(95);

    const figureJobId = await queueFigureAnalysis({
      paperId,
      storageKey: storageKey || getStoragePath(paperId),
    });

    if (figureJobId) {
      console.log(
        `[PDF Index Worker] Queued figure analysis job: ${figureJobId}`
      );
    } else {
      console.warn(
        `[PDF Index Worker] Failed to queue figure analysis job for paper ${paperId}`
      );
    }

    await job.updateProgress(100);

    console.log(
      `[PDF Index Worker] Successfully indexed paper ${paperId} (${chunks.length} text chunks)`
    );

    return {
      success: true,
      paperId,
      chunksCreated: chunks.length,
      pagesProcessed: numPages,
      totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
    };
  } catch (error) {
    console.error(`[PDF Index Worker] Failed to process job ${job.id}:`, error);

    // Update paper text_vector_status to 'failed'
    try {
      const supabase = createAdminSupabaseClient();
      await supabase
        .from('papers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ text_vector_status: 'failed' } as any)
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
      concurrency: 3, // Process 3 PDFs in parallel
      limiter: {
        max: 10, // Max 10 jobs
        duration: 1000, // Per second (for Gemini API rate limits)
      },
    }
  );

  // Event handlers
  pdfIndexWorker.on('completed', async job => {
    console.log(
      `[PDF Index Worker] Job ${job.id} completed for paper ${job.data.paperId}`
    );
  });

  pdfIndexWorker.on('failed', async (job, err) => {
    console.error(
      `[PDF Index Worker] Job ${job?.id} failed for paper ${job?.data.paperId}:`,
      err.message
    );
  });

  pdfIndexWorker.on('error', err => {
    console.error('[PDF Index Worker] Worker error:', err);
  });

  console.log('PDF indexing worker started (Custom RAG with pgvector)');
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
