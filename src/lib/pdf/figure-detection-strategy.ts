/**
 * Figure Detection Strategy
 *
 * Detects figures in PDFs using pdffigures2 Docker container.
 */

import { RenderedPage } from './renderer';
import { DetectedFigure, PageAnalysis } from './figure-types';
import {
  detectAndConvertFigures,
  isPdffigures2Available,
  PageDimensions,
} from './pdffigures2-client';

/**
 * Detection result containing figures grouped by page
 */
export interface DetectionResult {
  /** Figures detected per page */
  figuresByPage: Map<number, DetectedFigure[]>;
  /** Total figures detected */
  totalFigures: number;
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
 * Detect figures using pdffigures2
 *
 * This is the main entry point for figure detection.
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
 * console.log(`Detected ${result.totalFigures} figures`);
 * ```
 */
export async function detectFigures(
  pdfBuffer: Buffer,
  pages: RenderedPage[],
  options: {
    /** Progress callback */
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<DetectionResult> {
  let figuresByPage: Map<number, DetectedFigure[]>;

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
    // Return empty result on failure
    figuresByPage = new Map();
  }

  // Calculate total figures
  let totalFigures = 0;
  Array.from(figuresByPage.values()).forEach(figures => {
    totalFigures += figures.length;
  });

  // Call progress callback with completion
  options.onProgress?.(pages.length, pages.length);

  return {
    figuresByPage,
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
