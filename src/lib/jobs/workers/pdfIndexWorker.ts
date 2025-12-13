/**
 * PDF Indexing Worker - Custom RAG with pgvector (Multimodal Support)
 *
 * Extracts text and figures from PDFs, chunks them, generates embeddings,
 * and stores in pgvector for hybrid search.
 *
 * Multimodal features:
 * - Figure detection using Gemini Vision
 * - Figure extraction and analysis
 * - Bidirectional linking between text chunks and figures
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { PdfIndexJobData } from '../queues';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { downloadPdf } from '@/lib/storage/supabaseStorage';
import { extractTextFromPdf } from '@/lib/pdf/extractor';
import { chunkTextWithFigureRefs } from '@/lib/rag/chunker';
import { generateDocumentEmbeddings } from '@/lib/rag/embeddings';
import {
  insertChunksWithFigureRefs,
  deleteChunksForPaper,
} from '@/lib/db/chunks';
// Multimodal imports
import { renderPdfPagesStream, RenderedPage } from '@/lib/pdf/renderer';
import { detectFiguresInPage, PageAnalysis } from '@/lib/pdf/figure-detector';
import {
  extractFiguresFromPage,
  CroppedFigure,
} from '@/lib/pdf/figure-extractor';
import { RelatedTextChunk } from '@/lib/pdf/figure-context';
import {
  analyzeFigureWithProvidedContext,
  FigureAnalysis,
} from '@/lib/pdf/figure-analyzer';
import { indexAnalyzedFigures } from '@/lib/rag/figure-indexer';

// Environment variable to enable/disable multimodal processing
const ENABLE_MULTIMODAL = process.env.ENABLE_MULTIMODAL_RAG !== 'false';

// Worker instance
let pdfIndexWorker: Worker<PdfIndexJobData> | null = null;

/**
 * Process PDF indexing job (with multimodal support)
 *
 * Pipeline:
 * 1. Download PDF from Supabase Storage
 * 2. Extract text using pdf-parse
 * 3. Chunk text with figure reference extraction
 * 4. Generate embeddings and insert text chunks
 * 5. [Multimodal] Render PDF pages as images
 * 6. [Multimodal] Detect figures using Gemini Vision
 * 7. [Multimodal] Extract and analyze figures
 * 8. [Multimodal] Index figure chunks
 * 9. Update paper status
 */
async function processPdfIndexing(job: Job<PdfIndexJobData>) {
  const { collectionId, paperId } = job.data;

  console.log(
    `[PDF Index Worker] Processing job ${job.id} for paper ${paperId} in collection ${collectionId}`
  );
  console.log(
    `[PDF Index Worker] Multimodal processing: ${ENABLE_MULTIMODAL ? 'enabled' : 'disabled'}`
  );

  try {
    const supabase = createAdminSupabaseClient();

    // Step 1: Download PDF from Supabase Storage
    console.log(`[PDF Index Worker] Downloading PDF from storage...`);
    await job.updateProgress(5);

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

    await deleteChunksForPaper(paperId, collectionId);

    // Step 6: Insert text chunks into pgvector
    console.log(`[PDF Index Worker] Inserting text chunks into pgvector...`);
    await job.updateProgress(35);

    const insertedTextChunks = await insertChunksWithFigureRefs(
      chunks.map((chunk, i) => ({
        paperId,
        collectionId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
        embedding: embeddings[i],
        referencedFigures: chunk.referencedFigures,
      }))
    );

    let figuresIndexed = 0;

    // Multimodal processing (if enabled)
    if (ENABLE_MULTIMODAL) {
      try {
        figuresIndexed = await processMultimodal(
          job,
          pdfBuffer,
          paperId,
          collectionId,
          insertedTextChunks
        );
      } catch (multimodalError) {
        // Log error but don't fail the job - text chunks are already indexed
        console.error(
          `[PDF Index Worker] Multimodal processing failed (continuing with text-only):`,
          multimodalError
        );
      }
    }

    // Step 9: Update paper status to 'completed'
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
      `[PDF Index Worker] Successfully indexed paper ${paperId} (${chunks.length} text chunks, ${figuresIndexed} figures)`
    );

    return {
      success: true,
      paperId,
      chunksCreated: chunks.length,
      figuresIndexed,
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
 * Process multimodal content (figures) from PDF
 *
 * This function:
 * 1. Renders PDF pages as images
 * 2. Detects figures using Gemini Vision
 * 3. Extracts and crops figure images
 * 4. Analyzes figures with text context
 * 5. Indexes figure chunks
 *
 * @returns Number of figures indexed
 */
async function processMultimodal(
  job: Job<PdfIndexJobData>,
  pdfBuffer: Buffer,
  paperId: string,
  collectionId: string,
  textChunks: { id: string; chunkIndex: number; referencedFigures: string[] }[]
): Promise<number> {
  console.log(`[PDF Index Worker] Starting multimodal processing...`);

  // Step 5: Render PDF pages
  console.log(`[PDF Index Worker] Rendering PDF pages...`);
  await job.updateProgress(40);

  const pages: RenderedPage[] = [];
  let pageNum = 0;
  for await (const page of renderPdfPagesStream(pdfBuffer, { dpi: 150 })) {
    pages.push(page);
    pageNum++;
    if (pageNum % 5 === 0) {
      console.log(`[PDF Index Worker] Rendered ${pageNum} pages...`);
    }
  }
  console.log(`[PDF Index Worker] Rendered ${pages.length} pages total`);

  // Step 6: Detect figures in each page
  console.log(`[PDF Index Worker] Detecting figures in pages...`);
  await job.updateProgress(50);

  const pageAnalyses: PageAnalysis[] = [];
  for (let i = 0; i < pages.length; i += 3) {
    const batch = pages.slice(i, i + 3);
    const analyses = await Promise.all(
      batch.map(page => detectFiguresInPage(page.imageBuffer, page.pageNumber))
    );
    pageAnalyses.push(...analyses);

    // Rate limit delay
    if (i + 3 < pages.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  const totalFigures = pageAnalyses.reduce(
    (sum, a) => sum + a.figures.length,
    0
  );
  console.log(
    `[PDF Index Worker] Detected ${totalFigures} figures across ${pages.length} pages`
  );

  if (totalFigures === 0) {
    console.log(
      `[PDF Index Worker] No figures detected, skipping figure indexing`
    );
    return 0;
  }

  // Step 7: Extract and crop figures
  console.log(`[PDF Index Worker] Extracting figure images...`);
  await job.updateProgress(60);

  const allCroppedFigures: CroppedFigure[] = [];
  for (const page of pages) {
    const analysis = pageAnalyses.find(a => a.pageNumber === page.pageNumber);
    if (!analysis || analysis.figures.length === 0) continue;

    const cropped = await extractFiguresFromPage(
      page.imageBuffer,
      page.width,
      page.height,
      analysis.figures,
      page.pageNumber
    );
    allCroppedFigures.push(...cropped);
  }

  console.log(
    `[PDF Index Worker] Extracted ${allCroppedFigures.length} figure images`
  );

  // Build text context map for figure analysis
  const figureNumbers = allCroppedFigures.map(f => f.normalizedFigureNumber);
  const textContextMap = buildTextContextMap(textChunks, figureNumbers);

  // Step 8: Analyze figures with Vision AI
  console.log(`[PDF Index Worker] Analyzing figures with Vision AI...`);
  await job.updateProgress(70);

  const analyzedFigures: FigureAnalysis[] = [];
  const ANALYSIS_BATCH_SIZE = 2;

  for (let i = 0; i < allCroppedFigures.length; i += ANALYSIS_BATCH_SIZE) {
    const batch = allCroppedFigures.slice(i, i + ANALYSIS_BATCH_SIZE);

    const analyses = await Promise.all(
      batch.map(fig => {
        const context = textContextMap.get(fig.normalizedFigureNumber) || [];
        return analyzeFigureWithProvidedContext(fig, context);
      })
    );

    analyzedFigures.push(...analyses);

    // Rate limit delay
    if (i + ANALYSIS_BATCH_SIZE < allCroppedFigures.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`[PDF Index Worker] Analyzed ${analyzedFigures.length} figures`);

  // Step 9: Index figure chunks
  console.log(`[PDF Index Worker] Indexing figure chunks...`);
  await job.updateProgress(85);

  const indexed = await indexAnalyzedFigures(
    analyzedFigures,
    paperId,
    collectionId
  );

  console.log(`[PDF Index Worker] Indexed ${indexed.length} figure chunks`);

  return indexed.length;
}

/**
 * Build a map of figure numbers to text chunks that reference them
 * (Used to provide context during figure analysis)
 */
function buildTextContextMap(
  textChunks: { id: string; chunkIndex: number; referencedFigures: string[] }[],
  figureNumbers: string[]
): Map<string, RelatedTextChunk[]> {
  const contextMap = new Map<string, RelatedTextChunk[]>();

  // Initialize empty arrays
  for (const figNum of figureNumbers) {
    contextMap.set(figNum, []);
  }

  // Group text chunks by figure number
  for (const chunk of textChunks) {
    if (!chunk.referencedFigures) continue;

    for (const figNum of chunk.referencedFigures) {
      const normalizedFigNum = figNum.toLowerCase();
      for (const targetFigNum of figureNumbers) {
        if (targetFigNum.toLowerCase() === normalizedFigNum) {
          const existing = contextMap.get(targetFigNum) || [];
          existing.push({
            id: chunk.id,
            content: '', // Content not needed here, already in DB
            chunkIndex: chunk.chunkIndex,
          });
          contextMap.set(targetFigNum, existing);
        }
      }
    }
  }

  return contextMap;
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
