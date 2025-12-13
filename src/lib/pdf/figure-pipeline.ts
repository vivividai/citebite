/**
 * Figure Processing Pipeline
 *
 * Orchestrates the complete figure extraction and analysis workflow:
 * PDF → Render Pages → Detect Figures → Crop → Analyze → Store
 */

import { renderPdfPagesStream, RenderedPage } from './renderer';
import { detectFiguresInPage, PageAnalysis } from './figure-detector';
import { extractFiguresFromPage, CroppedFigure } from './figure-extractor';
import {
  analyzeFigureWithProvidedContext,
  FigureAnalysis,
} from './figure-analyzer';
import {
  findChunksForMultipleFigures,
  RelatedTextChunk,
} from './figure-context';

export interface FigurePipelineOptions {
  /** Max concurrent Vision API calls for detection */
  detectionConcurrency: number;
  /** Max concurrent Vision API calls for analysis */
  analysisConcurrency: number;
  /** Render DPI (72 = 1x, 144 = 2x, 150 = default, 300 = print quality) */
  renderDpi: number;
  /** Skip pages with no figures detected */
  skipEmptyPages: boolean;
  /** Progress callback */
  onProgress?: (progress: PipelineProgress) => void;
}

export interface PipelineProgress {
  phase: 'rendering' | 'detecting' | 'extracting' | 'analyzing';
  current: number;
  total: number;
  message: string;
}

export interface PipelineResult {
  /** All analyzed figures */
  figures: FigureAnalysis[];
  /** Pages with figures detected */
  pagesWithFigures: number[];
  /** Total pages processed */
  totalPages: number;
  /** Processing statistics */
  stats: {
    figuresDetected: number;
    figuresAnalyzed: number;
    processingTimeMs: number;
  };
}

const DEFAULT_OPTIONS: FigurePipelineOptions = {
  detectionConcurrency: 3,
  analysisConcurrency: 2,
  renderDpi: 150,
  skipEmptyPages: true,
};

/**
 * Process a PDF to extract and analyze all figures
 *
 * This is the main entry point for figure processing.
 * It handles the complete pipeline from PDF to analyzed figures.
 *
 * @param pdfBuffer - PDF file as Buffer
 * @param paperId - Paper ID for database context
 * @param collectionId - Collection ID
 * @param options - Pipeline options
 * @returns Pipeline result with all analyzed figures
 *
 * @example
 * ```typescript
 * const result = await processPdfFigures(pdfBuffer, 'paper123', 'collection456', {
 *   onProgress: (p) => console.log(`${p.phase}: ${p.current}/${p.total}`)
 * });
 * console.log(`Found ${result.figures.length} figures`);
 * ```
 */
export async function processPdfFigures(
  pdfBuffer: Buffer,
  paperId: string,
  collectionId: string,
  options: Partial<FigurePipelineOptions> = {}
): Promise<PipelineResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  const pages: RenderedPage[] = [];
  const pageAnalyses: PageAnalysis[] = [];
  const allCroppedFigures: CroppedFigure[] = [];

  // Phase 1: Render pages and detect figures
  let pageCount = 0;
  for await (const page of renderPdfPagesStream(pdfBuffer, {
    dpi: opts.renderDpi,
  })) {
    pages.push(page);
    pageCount++;

    opts.onProgress?.({
      phase: 'rendering',
      current: pageCount,
      total: pageCount, // Total unknown during streaming
      message: `Rendering page ${pageCount}...`,
    });
  }

  // Phase 2: Detect figures in batches
  for (let i = 0; i < pages.length; i += opts.detectionConcurrency) {
    const batch = pages.slice(i, i + opts.detectionConcurrency);

    const batchAnalyses = await Promise.all(
      batch.map(page => detectFiguresInPage(page.imageBuffer, page.pageNumber))
    );

    pageAnalyses.push(...batchAnalyses);

    opts.onProgress?.({
      phase: 'detecting',
      current: Math.min(i + opts.detectionConcurrency, pages.length),
      total: pages.length,
      message: `Detecting figures: ${i + batch.length}/${pages.length} pages`,
    });

    // Rate limit delay
    if (i + opts.detectionConcurrency < pages.length) {
      await delay(300);
    }
  }

  // Phase 3: Extract (crop) figures
  for (const page of pages) {
    const analysis = pageAnalyses.find(a => a.pageNumber === page.pageNumber);
    if (!analysis || analysis.figures.length === 0) continue;

    const croppedFigures = await extractFiguresFromPage(
      page.imageBuffer,
      page.width,
      page.height,
      analysis.figures,
      page.pageNumber
    );

    allCroppedFigures.push(...croppedFigures);

    opts.onProgress?.({
      phase: 'extracting',
      current: allCroppedFigures.length,
      total: pageAnalyses.reduce((sum, a) => sum + a.figures.length, 0),
      message: `Extracted ${allCroppedFigures.length} figures`,
    });
  }

  // Phase 4: Get text context for all figures at once
  const figureNumbers = allCroppedFigures.map(f => f.normalizedFigureNumber);
  const figureContextMap = await findChunksForMultipleFigures(
    paperId,
    collectionId,
    figureNumbers
  );

  // Phase 5: Analyze figures
  const analyzedFigures: FigureAnalysis[] = [];

  for (let i = 0; i < allCroppedFigures.length; i += opts.analysisConcurrency) {
    const batch = allCroppedFigures.slice(i, i + opts.analysisConcurrency);

    const batchAnalyses = await Promise.all(
      batch.map(figure => {
        const context =
          figureContextMap.get(figure.normalizedFigureNumber) || [];
        return analyzeFigureWithProvidedContext(figure, context);
      })
    );

    analyzedFigures.push(...batchAnalyses);

    opts.onProgress?.({
      phase: 'analyzing',
      current: analyzedFigures.length,
      total: allCroppedFigures.length,
      message: `Analyzing figures: ${analyzedFigures.length}/${allCroppedFigures.length}`,
    });

    // Rate limit delay
    if (i + opts.analysisConcurrency < allCroppedFigures.length) {
      await delay(500);
    }
  }

  const pagesWithFigures = pageAnalyses
    .filter(a => a.figures.length > 0)
    .map(a => a.pageNumber);

  return {
    figures: analyzedFigures,
    pagesWithFigures,
    totalPages: pages.length,
    stats: {
      figuresDetected: allCroppedFigures.length,
      figuresAnalyzed: analyzedFigures.length,
      processingTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Process figures from already-rendered pages
 * (For when pages have already been rendered)
 */
export async function processFiguresFromPages(
  pages: RenderedPage[],
  paperId: string,
  collectionId: string,
  textChunkContextMap: Map<string, RelatedTextChunk[]>
): Promise<FigureAnalysis[]> {
  const analyzedFigures: FigureAnalysis[] = [];

  // Detect and extract figures from each page
  for (const page of pages) {
    const analysis = await detectFiguresInPage(
      page.imageBuffer,
      page.pageNumber
    );

    if (analysis.figures.length === 0) continue;

    const croppedFigures = await extractFiguresFromPage(
      page.imageBuffer,
      page.width,
      page.height,
      analysis.figures,
      page.pageNumber
    );

    // Analyze each figure
    for (const cropped of croppedFigures) {
      const context =
        textChunkContextMap.get(cropped.normalizedFigureNumber) || [];
      const analyzed = await analyzeFigureWithProvidedContext(cropped, context);
      analyzedFigures.push(analyzed);
    }
  }

  return analyzedFigures;
}

/**
 * Simple delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
