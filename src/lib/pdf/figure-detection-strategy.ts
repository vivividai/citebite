/**
 * Figure Detection Strategy
 *
 * Provides a strategy pattern for selecting between different
 * figure detection methods (Gemini Vision API vs pdffigures2).
 */

import { RenderedPage } from './renderer';
import {
  DetectedFigure,
  PageAnalysis,
  detectFiguresInPage,
} from './figure-detector';
import {
  detectAndConvertFigures,
  isPdffigures2Available,
  PageDimensions,
} from './pdffigures2-client';

/**
 * Available detection strategies
 */
export type DetectionStrategy = 'gemini' | 'pdffigures2';

/**
 * Get the configured detection strategy from environment
 */
export function getDetectionStrategy(): DetectionStrategy {
  const strategy = process.env.FIGURE_DETECTION_STRATEGY?.toLowerCase();

  if (strategy === 'pdffigures2') {
    return 'pdffigures2';
  }

  // Default to gemini
  return 'gemini';
}

/**
 * Detection result containing figures grouped by page
 */
export interface DetectionResult {
  /** Figures detected per page */
  figuresByPage: Map<number, DetectedFigure[]>;
  /** Detection strategy used */
  strategy: DetectionStrategy;
  /** Total figures detected */
  totalFigures: number;
}

/**
 * Detect figures using Gemini Vision API
 *
 * @param pages - Rendered PDF pages
 * @param concurrency - Max concurrent API calls
 * @param onProgress - Progress callback
 */
async function detectWithGemini(
  pages: RenderedPage[],
  concurrency: number,
  onProgress?: (current: number, total: number) => void
): Promise<Map<number, DetectedFigure[]>> {
  const figuresByPage = new Map<number, DetectedFigure[]>();

  // Process in batches
  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);

    const batchAnalyses = await Promise.all(
      batch.map(page => detectFiguresInPage(page.imageBuffer, page.pageNumber))
    );

    for (const analysis of batchAnalyses) {
      if (analysis.figures.length > 0) {
        figuresByPage.set(analysis.pageNumber, analysis.figures);
      }
    }

    onProgress?.(Math.min(i + concurrency, pages.length), pages.length);

    // Rate limit delay
    if (i + concurrency < pages.length) {
      await delay(300);
    }
  }

  return figuresByPage;
}

/**
 * Detect figures using pdffigures2 Docker container
 *
 * @param pdfBuffer - Original PDF buffer
 * @param pages - Rendered PDF pages (for dimensions)
 */
async function detectWithPdffigures2(
  pdfBuffer: Buffer,
  pages: RenderedPage[]
): Promise<Map<number, DetectedFigure[]>> {
  // Build page dimensions map
  const pageDimensions = new Map<number, PageDimensions>();
  for (const page of pages) {
    pageDimensions.set(page.pageNumber, {
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
    });
  }

  return detectAndConvertFigures(pdfBuffer, pageDimensions);
}

/**
 * Detect figures using the configured strategy
 *
 * This is the main entry point for figure detection.
 * It automatically selects the detection method based on configuration.
 *
 * @param pdfBuffer - Original PDF buffer (required for pdffigures2)
 * @param pages - Rendered PDF pages
 * @param options - Detection options
 * @returns Detection result with figures grouped by page
 *
 * @example
 * ```typescript
 * const result = await detectFigures(pdfBuffer, pages, {
 *   onProgress: (current, total) => console.log(`${current}/${total}`)
 * });
 * console.log(`Detected ${result.totalFigures} figures using ${result.strategy}`);
 * ```
 */
export async function detectFigures(
  pdfBuffer: Buffer,
  pages: RenderedPage[],
  options: {
    /** Override the default strategy */
    strategy?: DetectionStrategy;
    /** Concurrency for Gemini detection */
    concurrency?: number;
    /** Progress callback (for Gemini detection) */
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<DetectionResult> {
  const strategy = options.strategy || getDetectionStrategy();
  const concurrency = options.concurrency || 3;

  let figuresByPage: Map<number, DetectedFigure[]>;

  if (strategy === 'pdffigures2') {
    try {
      // Check if pdffigures2 is available
      const available = await isPdffigures2Available();

      if (!available) {
        console.warn(
          'pdffigures2 service not available, figure detection will be skipped'
        );
        figuresByPage = new Map();
      } else {
        figuresByPage = await detectWithPdffigures2(pdfBuffer, pages);
      }
    } catch (error) {
      console.error('pdffigures2 detection failed:', error);
      // Return empty result on failure (no fallback per design)
      figuresByPage = new Map();
    }
  } else {
    // Use Gemini Vision API
    figuresByPage = await detectWithGemini(
      pages,
      concurrency,
      options.onProgress
    );
  }

  // Calculate total figures
  let totalFigures = 0;
  Array.from(figuresByPage.values()).forEach(figures => {
    totalFigures += figures.length;
  });

  return {
    figuresByPage,
    strategy,
    totalFigures,
  };
}

/**
 * Convert detection result to PageAnalysis array
 * (for compatibility with existing pipeline)
 */
export function toPageAnalyses(
  detectionResult: DetectionResult
): PageAnalysis[] {
  const analyses: PageAnalysis[] = [];

  Array.from(detectionResult.figuresByPage.entries()).forEach(
    ([pageNumber, figures]) => {
      analyses.push({
        pageNumber,
        figures,
      });
    }
  );

  return analyses.sort((a, b) => a.pageNumber - b.pageNumber);
}

/**
 * Simple delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
