/**
 * Figure Analysis Worker - Multimodal RAG for Figure/Chart Extraction
 *
 * Separate worker for processing figures/charts from PDFs:
 * - PDF page rendering
 * - Figure detection using pdffigures2
 * - Figure extraction and analysis with Gemini Vision
 * - Figure chunk indexing
 *
 * This worker runs after text indexing completes successfully.
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { FigureAnalysisJobData } from '../queues';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { downloadPdf } from '@/lib/storage/supabaseStorage';
import { renderPdfPagesStream, RenderedPage } from '@/lib/pdf/renderer';
import {
  detectFigures,
  toPageAnalyses,
} from '@/lib/pdf/figure-detection-strategy';
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
import { getTextChunksWithFigureRefs } from '@/lib/db/chunks';

// Configuration
const WORKER_CONCURRENCY = 5;
const ANALYSIS_BATCH_SIZE = 10; // Vision API parallel processing
const RATE_LIMIT_DELAY_MS = 200;

// Worker instance
let figureAnalysisWorker: Worker<FigureAnalysisJobData> | null = null;

/**
 * Process figure analysis job
 *
 * Pipeline:
 * 1. Update image_vector_status to 'processing'
 * 2. Download PDF from Supabase Storage
 * 3. Render PDF pages as images
 * 4. Detect figures using pdffigures2
 * 5. If no figures, mark as 'skipped' and exit
 * 6. Extract and crop figure images
 * 7. Analyze figures with Gemini Vision
 * 8. Index figure chunks
 * 9. Update image_vector_status to 'completed'
 */
async function processFigureAnalysis(job: Job<FigureAnalysisJobData>) {
  const { collectionId, paperId } = job.data;

  console.log(
    `[Figure Analysis Worker] Processing job ${job.id} for paper ${paperId}`
  );

  const supabase = createAdminSupabaseClient();

  try {
    // Step 1: Update status to 'processing'
    // Type assertion needed until migration is applied and types are regenerated
    await supabase
      .from('papers')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ image_vector_status: 'processing' } as any)
      .eq('paper_id', paperId);

    await job.updateProgress(5);

    // Step 2: Download PDF from Supabase Storage
    console.log(`[Figure Analysis Worker] Downloading PDF...`);
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await downloadPdf(collectionId, paperId);
    } catch (error) {
      throw new Error(
        `Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    console.log(
      `[Figure Analysis Worker] Downloaded PDF (${pdfBuffer.length} bytes)`
    );
    await job.updateProgress(10);

    // Step 3: Render PDF pages as images
    console.log(`[Figure Analysis Worker] Rendering PDF pages...`);
    const pages: RenderedPage[] = [];
    let pageNum = 0;
    for await (const page of renderPdfPagesStream(pdfBuffer, { dpi: 150 })) {
      pages.push(page);
      pageNum++;
      if (pageNum % 5 === 0) {
        console.log(`[Figure Analysis Worker] Rendered ${pageNum} pages...`);
      }
    }
    console.log(
      `[Figure Analysis Worker] Rendered ${pages.length} pages total`
    );
    await job.updateProgress(25);

    // Step 4: Detect figures using pdffigures2
    console.log(`[Figure Analysis Worker] Detecting figures...`);
    const detectionResult = await detectFigures(pdfBuffer, pages);
    const pageAnalyses = toPageAnalyses(detectionResult);

    console.log(
      `[Figure Analysis Worker] Detected ${detectionResult.totalFigures} figures`
    );
    await job.updateProgress(40);

    // Step 5: If no figures, mark as 'skipped' and exit
    if (detectionResult.totalFigures === 0) {
      console.log(
        `[Figure Analysis Worker] No figures detected, marking as skipped`
      );

      await supabase
        .from('papers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ image_vector_status: 'skipped' } as any)
        .eq('paper_id', paperId);

      await job.updateProgress(100);

      return {
        success: true,
        paperId,
        figuresIndexed: 0,
        status: 'skipped',
      };
    }

    // Step 6: Extract and crop figure images
    console.log(`[Figure Analysis Worker] Extracting figure images...`);
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
      `[Figure Analysis Worker] Extracted ${allCroppedFigures.length} figure images`
    );
    await job.updateProgress(55);

    // Get text chunks with figure references for context
    const textChunks = await getTextChunksWithFigureRefs(paperId, collectionId);
    const figureNumbers = allCroppedFigures.map(f => f.normalizedFigureNumber);
    const textContextMap = buildTextContextMap(textChunks, figureNumbers);

    // Step 7: Analyze figures with Vision AI
    console.log(`[Figure Analysis Worker] Analyzing figures with Vision AI...`);
    await job.updateProgress(60);

    const analyzedFigures: FigureAnalysis[] = [];

    for (let i = 0; i < allCroppedFigures.length; i += ANALYSIS_BATCH_SIZE) {
      const batch = allCroppedFigures.slice(i, i + ANALYSIS_BATCH_SIZE);

      const analyses = await Promise.all(
        batch.map(fig => {
          const context = textContextMap.get(fig.normalizedFigureNumber) || [];
          return analyzeFigureWithProvidedContext(fig, context);
        })
      );

      analyzedFigures.push(...analyses);

      // Update progress
      const batchProgress = Math.min(
        60 +
          Math.floor(
            ((i + ANALYSIS_BATCH_SIZE) / allCroppedFigures.length) * 25
          ),
        85
      );
      await job.updateProgress(batchProgress);

      // Rate limit delay between batches
      if (i + ANALYSIS_BATCH_SIZE < allCroppedFigures.length) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }
    }

    console.log(
      `[Figure Analysis Worker] Analyzed ${analyzedFigures.length} figures`
    );

    // Step 8: Index figure chunks
    console.log(`[Figure Analysis Worker] Indexing figure chunks...`);
    await job.updateProgress(90);

    const indexed = await indexAnalyzedFigures(
      analyzedFigures,
      paperId,
      collectionId
    );

    console.log(
      `[Figure Analysis Worker] Indexed ${indexed.length} figure chunks`
    );

    // Step 9: Update status to 'completed'
    await supabase
      .from('papers')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ image_vector_status: 'completed' } as any)
      .eq('paper_id', paperId);

    await job.updateProgress(100);

    console.log(
      `[Figure Analysis Worker] Successfully processed paper ${paperId} (${indexed.length} figures)`
    );

    return {
      success: true,
      paperId,
      figuresIndexed: indexed.length,
      status: 'completed',
    };
  } catch (error) {
    console.error(
      `[Figure Analysis Worker] Failed to process job ${job.id}:`,
      error
    );

    // Update status to 'failed'
    try {
      await supabase
        .from('papers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ image_vector_status: 'failed' } as any)
        .eq('paper_id', paperId);
    } catch (updateError) {
      console.error(
        `[Figure Analysis Worker] Failed to update status to 'failed':`,
        updateError
      );
    }

    throw error; // BullMQ will handle retries
  }
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
 * Start Figure Analysis Worker
 */
export function startFigureAnalysisWorker(): Worker<FigureAnalysisJobData> | null {
  if (!process.env.REDIS_URL) {
    console.warn(
      'REDIS_URL not configured. Figure analysis worker will not start.'
    );
    return null;
  }

  if (figureAnalysisWorker) {
    console.log('Figure analysis worker already running');
    return figureAnalysisWorker;
  }

  const connection = getRedisClient();
  if (!connection) {
    return null;
  }

  figureAnalysisWorker = new Worker<FigureAnalysisJobData>(
    'figure-analysis',
    processFigureAnalysis,
    {
      connection,
      concurrency: WORKER_CONCURRENCY,
      limiter: {
        max: 10, // Max 10 jobs
        duration: 1000, // Per second (for Vision API rate limits)
      },
    }
  );

  // Event handlers
  figureAnalysisWorker.on('completed', async job => {
    console.log(
      `[Figure Analysis Worker] Job ${job.id} completed for paper ${job.data.paperId}`
    );
  });

  figureAnalysisWorker.on('failed', async (job, err) => {
    if (!job) {
      console.error(
        '[Figure Analysis Worker] Job failed with no job data:',
        err
      );
      return;
    }

    console.error(
      `[Figure Analysis Worker] Job ${job.id} failed for paper ${job.data.paperId}:`,
      err.message
    );

    // Update status to 'failed' if not already done
    try {
      const supabase = createAdminSupabaseClient();
      await supabase
        .from('papers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ image_vector_status: 'failed' } as any)
        .eq('paper_id', job.data.paperId);
    } catch (updateError) {
      console.error(
        '[Figure Analysis Worker] Error updating failed status:',
        updateError
      );
    }
  });

  figureAnalysisWorker.on('error', err => {
    console.error('[Figure Analysis Worker] Worker error:', err);
  });

  console.log('Figure analysis worker started');
  return figureAnalysisWorker;
}

/**
 * Stop Figure Analysis Worker
 */
export async function stopFigureAnalysisWorker(): Promise<void> {
  if (figureAnalysisWorker) {
    await figureAnalysisWorker.close();
    figureAnalysisWorker = null;
    console.log('Figure analysis worker stopped');
  }
}
