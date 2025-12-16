/**
 * Figure Processing Pipeline
 *
 * Orchestrates the complete figure extraction and analysis workflow:
 * PDF → Render Pages → Detect Figures (pdffigures2) → Crop → Analyze (Gemini Vision) → Store
 */

import { renderPdfPagesStream, RenderedPage } from './renderer';
import { extractFiguresFromPage, CroppedFigure } from './figure-extractor';
import {
  analyzeFigureWithProvidedContext,
  FigureAnalysis,
} from './figure-analyzer';
import {
  findChunksForMultipleFigures,
  RelatedTextChunk,
} from './figure-context';
import { detectFigures, toPageAnalyses } from './figure-detection-strategy';

export interface FigurePipelineOptions {
  /** Max concurrent Vision API calls for analysis */
  analysisConcurrency: number;
  /** Render DPI (72 = 1x, 144 = 2x, 150 = default, 300 = print quality) */
  renderDpi: number;
  /** Skip pages with no figures detected */
  skipEmptyPages: boolean;
  /** Skip Gemini analysis phase (just crop images, faster for testing) */
  skipAnalysis?: boolean;
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
  const allCroppedFigures: CroppedFigure[] = [];

  // Phase 1: Render pages
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

  // Phase 2: Detect figures using pdffigures2
  opts.onProgress?.({
    phase: 'detecting',
    current: 0,
    total: pages.length,
    message: 'Detecting figures using pdffigures2...',
  });

  const detectionResult = await detectFigures(pdfBuffer, pages, {
    onProgress: (current, total) => {
      opts.onProgress?.({
        phase: 'detecting',
        current,
        total,
        message: `Detecting figures: ${current}/${total} pages`,
      });
    },
  });

  const pageAnalyses = toPageAnalyses(detectionResult);

  opts.onProgress?.({
    phase: 'detecting',
    current: pages.length,
    total: pages.length,
    message: `Detected ${detectionResult.totalFigures} figures using pdffigures2`,
  });

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
      total: detectionResult.totalFigures,
      message: `Extracted ${allCroppedFigures.length} figures`,
    });
  }

  // Phase 4 & 5: Get context and analyze figures (or skip if skipAnalysis)
  const analyzedFigures: FigureAnalysis[] = [];

  if (opts.skipAnalysis) {
    // Skip analysis - convert cropped figures to FigureAnalysis with placeholder values
    opts.onProgress?.({
      phase: 'analyzing',
      current: 0,
      total: allCroppedFigures.length,
      message: 'Skipping analysis phase (--skip-analysis)',
    });

    for (const cropped of allCroppedFigures) {
      analyzedFigures.push({
        figureNumber: cropped.figureNumber,
        normalizedFigureNumber: cropped.normalizedFigureNumber,
        caption: cropped.caption,
        type: cropped.type,
        pageNumber: cropped.pageNumber,
        imageBuffer: cropped.imageBuffer,
        description: '(Analysis skipped)',
        mentionedInChunkIds: [],
      });
    }
  } else {
    // Full analysis flow
    const figureNumbers = allCroppedFigures.map(f => f.normalizedFigureNumber);
    const figureContextMap = await findChunksForMultipleFigures(
      paperId,
      collectionId,
      figureNumbers
    );

    for (
      let i = 0;
      i < allCroppedFigures.length;
      i += opts.analysisConcurrency
    ) {
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
 * Process figures from already-rendered pages using pdffigures2
 * (For when pages have already been rendered)
 */
export async function processFiguresFromPages(
  pdfBuffer: Buffer,
  pages: RenderedPage[],
  paperId: string,
  collectionId: string,
  textChunkContextMap: Map<string, RelatedTextChunk[]>
): Promise<FigureAnalysis[]> {
  const analyzedFigures: FigureAnalysis[] = [];

  // Detect figures using pdffigures2
  const detectionResult = await detectFigures(pdfBuffer, pages);
  const pageAnalyses = toPageAnalyses(detectionResult);

  // Extract and analyze figures from each page
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
