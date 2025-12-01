/**
 * PDF Indexing Worker - Custom RAG with pgvector
 *
 * Extracts text from PDFs, chunks them, generates embeddings,
 * and stores in pgvector for hybrid search.
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { PdfIndexJobData } from '../queues';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { downloadPdf } from '@/lib/storage/supabaseStorage';
import { extractTextFromPdf } from '@/lib/pdf/extractor';
import { chunkText } from '@/lib/rag/chunker';
import { generateDocumentEmbeddings } from '@/lib/rag/embeddings';
import { insertChunks, deleteChunksForPaper } from '@/lib/db/chunks';

// Worker instance
let pdfIndexWorker: Worker<PdfIndexJobData> | null = null;

/**
 * Process PDF indexing job
 *
 * Pipeline:
 * 1. Download PDF from Supabase Storage
 * 2. Extract text using pdf-parse
 * 3. Chunk text with overlap
 * 4. Generate embeddings using Gemini
 * 5. Insert chunks into pgvector
 * 6. Update paper status
 */
async function processPdfIndexing(job: Job<PdfIndexJobData>) {
  const { collectionId, paperId } = job.data;

  console.log(
    `[PDF Index Worker] Processing job ${job.id} for paper ${paperId} in collection ${collectionId}`
  );

  try {
    const supabase = createAdminSupabaseClient();

    // Step 1: Download PDF from Supabase Storage
    console.log(`[PDF Index Worker] Downloading PDF from storage...`);
    await job.updateProgress(10);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await downloadPdf(collectionId, paperId);
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
    await job.updateProgress(20);

    const { text, numPages } = await extractTextFromPdf(pdfBuffer);

    if (!text || text.length < 100) {
      throw new Error(
        `PDF text extraction failed or content too short (${text?.length || 0} chars)`
      );
    }

    console.log(
      `[PDF Index Worker] Extracted ${text.length} chars from ${numPages} pages`
    );

    // Step 3: Chunk text
    console.log(`[PDF Index Worker] Chunking text...`);
    await job.updateProgress(40);

    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new Error('No chunks generated from PDF text');
    }

    console.log(`[PDF Index Worker] Created ${chunks.length} chunks`);

    // Step 4: Generate embeddings (batched)
    console.log(`[PDF Index Worker] Generating embeddings...`);
    await job.updateProgress(60);

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
    await job.updateProgress(75);

    await deleteChunksForPaper(paperId, collectionId);

    // Step 6: Insert into pgvector
    console.log(`[PDF Index Worker] Inserting chunks into pgvector...`);
    await job.updateProgress(85);

    await insertChunks(
      chunks.map((chunk, i) => ({
        paperId,
        collectionId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
        embedding: embeddings[i],
      }))
    );

    // Step 7: Update paper status to 'completed'
    console.log(`[PDF Index Worker] Updating paper status...`);
    await job.updateProgress(95);

    const { error: updateError } = await supabase
      .from('papers')
      .update({ vector_status: 'completed' })
      .eq('paper_id', paperId);

    if (updateError) {
      console.error(
        `[PDF Index Worker] Failed to update paper status:`,
        updateError
      );
      // Don't throw - chunks are already indexed
    }

    await job.updateProgress(100);

    console.log(
      `[PDF Index Worker] Successfully indexed paper ${paperId} (${chunks.length} chunks)`
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
