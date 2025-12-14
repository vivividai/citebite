/**
 * pdffigures2 HTTP Client
 *
 * Client for communicating with the pdffigures2 Docker container
 * to detect figures in PDF documents.
 */

import { BoundingBox, DetectedFigure } from './figure-types';

/**
 * pdffigures2 API response format
 */
export interface Pdffigures2Figure {
  /** Figure name (e.g., "Figure 1", "Table 2") */
  name: string;
  /** Figure type: "Figure" or "Table" */
  figType: 'Figure' | 'Table';
  /** Page number (0-indexed in pdffigures2) */
  page: number;
  /** Caption text */
  caption: string;
  /** Region boundary in pixel coordinates */
  regionBoundary: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  /** Image boundary (figure content only, without caption) */
  imageBoundary?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null;
}

export interface Pdffigures2Response {
  figures: Pdffigures2Figure[];
  error?: string;
}

/**
 * Page dimensions for coordinate conversion
 */
export interface PageDimensions {
  pageNumber: number;
  width: number;
  height: number;
}

/**
 * PDF standard resolution in DPI (points per inch)
 */
const PDF_STANDARD_DPI = 72;

/**
 * pdffigures2 API endpoint URL
 * Can be overridden via PDFFIGURES2_API_URL environment variable
 */
const PDFFIGURES2_API_URL =
  process.env.PDFFIGURES2_API_URL || 'http://localhost:8081';

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT = 60000; // 60 seconds

/**
 * Detect figures in a PDF using pdffigures2 Docker container
 *
 * @param pdfBuffer - PDF file as Buffer
 * @returns Array of detected figures from pdffigures2
 *
 * @example
 * ```typescript
 * const figures = await detectFiguresWithPdffigures2(pdfBuffer);
 * console.log(`Found ${figures.length} figures`);
 * ```
 */
export async function detectFiguresWithPdffigures2(
  pdfBuffer: Buffer
): Promise<Pdffigures2Figure[]> {
  const formData = new FormData();
  // Convert Buffer to Uint8Array for Blob compatibility
  const uint8Array = new Uint8Array(pdfBuffer);
  const blob = new Blob([uint8Array], { type: 'application/pdf' });
  formData.append('pdf', blob, 'document.pdf');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${PDFFIGURES2_API_URL}/extract`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `pdffigures2 API error: ${response.status} - ${errorData.error || response.statusText}`
      );
    }

    const data: Pdffigures2Response = await response.json();

    if (data.error) {
      throw new Error(`pdffigures2 extraction error: ${data.error}`);
    }

    return data.figures || [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('pdffigures2 request timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if pdffigures2 service is healthy
 *
 * @returns true if service is available and healthy
 */
export async function isPdffigures2Available(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${PDFFIGURES2_API_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return false;

    const data = await response.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Convert pdffigures2 PDF coordinates to normalized coordinates (0-1)
 *
 * pdffigures2 returns coordinates in PDF points (72 DPI).
 * We need to:
 * 1. Scale these coordinates to match the rendered image DPI
 * 2. Convert to normalized coordinates (0-1) for consistency with Gemini Vision detection
 *
 * @param region - Region boundary from pdffigures2 (in PDF points, 72 DPI)
 * @param pageWidth - Rendered page width in pixels
 * @param pageHeight - Rendered page height in pixels
 * @param renderedDpi - DPI used to render the page (default: 150)
 * @returns Normalized bounding box (0-1 range)
 */
export function convertToNormalizedBoundingBox(
  region: { x1: number; y1: number; x2: number; y2: number },
  pageWidth: number,
  pageHeight: number,
  renderedDpi: number = 150
): BoundingBox {
  // Scale factor to convert from PDF coordinates (72 DPI) to rendered coordinates
  const scaleFactor = renderedDpi / PDF_STANDARD_DPI;

  // Scale pdffigures2 coordinates from PDF points to rendered pixels
  const scaledX1 = region.x1 * scaleFactor;
  const scaledY1 = region.y1 * scaleFactor;
  const scaledX2 = region.x2 * scaleFactor;
  const scaledY2 = region.y2 * scaleFactor;

  // Clamp values to valid range
  const x1 = Math.max(0, Math.min(scaledX1, pageWidth));
  const y1 = Math.max(0, Math.min(scaledY1, pageHeight));
  const x2 = Math.max(0, Math.min(scaledX2, pageWidth));
  const y2 = Math.max(0, Math.min(scaledY2, pageHeight));

  return {
    x: x1 / pageWidth,
    y: y1 / pageHeight,
    width: (x2 - x1) / pageWidth,
    height: (y2 - y1) / pageHeight,
  };
}

/**
 * Convert pdffigures2 figure type to our internal type
 */
function convertFigureType(
  figType: string
): 'chart' | 'diagram' | 'image' | 'table' | 'other' {
  const lowerType = figType.toLowerCase();

  if (lowerType === 'table') {
    return 'table';
  }

  // pdffigures2 classifies everything else as "Figure"
  // We default to 'diagram' since most academic figures are diagrams/charts
  return 'diagram';
}

/**
 * Convert pdffigures2 figures to our DetectedFigure format
 *
 * This function transforms the pdffigures2 output to match the format
 * expected by the figure processing pipeline.
 *
 * @param pdffigures2Figures - Raw figures from pdffigures2
 * @param pageDimensions - Map of page number to dimensions
 * @param renderedDpi - DPI used to render the pages (default: 150)
 * @returns Array of DetectedFigure in our standard format
 */
export function convertToDetectedFigures(
  pdffigures2Figures: Pdffigures2Figure[],
  pageDimensions: Map<number, PageDimensions>,
  renderedDpi: number = 150
): Map<number, DetectedFigure[]> {
  const figuresByPage = new Map<number, DetectedFigure[]>();

  for (const fig of pdffigures2Figures) {
    // pdffigures2 uses 0-indexed pages, we use 1-indexed
    const pageNumber = fig.page + 1;

    const pageDim = pageDimensions.get(pageNumber);
    if (!pageDim) {
      console.warn(
        `Page dimensions not found for page ${pageNumber}, skipping figure`
      );
      continue;
    }

    // Use imageBoundary if available (figure content only), otherwise use regionBoundary
    const boundary = fig.imageBoundary || fig.regionBoundary;

    const boundingBox = convertToNormalizedBoundingBox(
      boundary,
      pageDim.width,
      pageDim.height,
      renderedDpi
    );

    const detectedFigure: DetectedFigure = {
      figureNumber: fig.name,
      caption: fig.caption,
      boundingBox,
      type: convertFigureType(fig.figType),
    };

    if (!figuresByPage.has(pageNumber)) {
      figuresByPage.set(pageNumber, []);
    }
    figuresByPage.get(pageNumber)!.push(detectedFigure);
  }

  return figuresByPage;
}

/**
 * Detect figures using pdffigures2 and convert to our format
 *
 * This is the main function to use when integrating pdffigures2
 * into the figure processing pipeline.
 *
 * @param pdfBuffer - PDF file as Buffer
 * @param pageDimensions - Map of page number to dimensions (from rendered pages)
 * @param renderedDpi - DPI used to render the pages (default: 150)
 * @returns Map of page number to detected figures
 */
export async function detectAndConvertFigures(
  pdfBuffer: Buffer,
  pageDimensions: Map<number, PageDimensions>,
  renderedDpi: number = 150
): Promise<Map<number, DetectedFigure[]>> {
  const pdffigures2Figures = await detectFiguresWithPdffigures2(pdfBuffer);
  return convertToDetectedFigures(
    pdffigures2Figures,
    pageDimensions,
    renderedDpi
  );
}
