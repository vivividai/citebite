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
 * Convert pdffigures2 coordinates to normalized coordinates (0-1)
 *
 * pdffigures2 returns coordinates in pixel units at 72 DPI with:
 * - Origin at top-left (0,0 = top-left corner)
 * - Y-axis pointing downward (same as image coordinates)
 * - Based on the PDF's cropbox
 *
 * Important: pdffigures2 may return figures that extend beyond page boundaries
 * (e.g., when caption overflows to next page). We handle this by:
 * 1. Scaling coordinates to match rendered DPI
 * 2. Clamping to page boundaries while preserving figure proportions
 *
 * @param region - Region boundary from pdffigures2 (in pixels at 72 DPI)
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
  // Scale factor to convert from 72 DPI to rendered DPI
  const scaleFactor = renderedDpi / PDF_STANDARD_DPI;

  // Scale coordinates to rendered pixel space
  let scaledX1 = region.x1 * scaleFactor;
  let scaledY1 = region.y1 * scaleFactor;
  let scaledX2 = region.x2 * scaleFactor;
  let scaledY2 = region.y2 * scaleFactor;

  // Calculate original figure height (needed for overflow handling)
  const originalHeight = scaledY2 - scaledY1;

  // Handle figures that extend beyond page boundaries
  // If the figure overflows, we try to capture as much as possible within the page
  if (scaledY2 > pageHeight) {
    // Figure extends beyond bottom of page
    // Clamp y2 to page height, but keep y1 if valid
    scaledY2 = pageHeight;
    // If this makes the figure too small (less than 20% of original), adjust y1
    const newHeight = scaledY2 - scaledY1;
    if (newHeight < originalHeight * 0.2 && scaledY1 > 0) {
      // Move y1 up to capture more of the figure
      scaledY1 = Math.max(0, scaledY2 - originalHeight);
    }
  }

  if (scaledY1 < 0) {
    // Figure extends beyond top of page
    scaledY1 = 0;
  }

  if (scaledX2 > pageWidth) {
    scaledX2 = pageWidth;
  }

  if (scaledX1 < 0) {
    scaledX1 = 0;
  }

  // Ensure we have valid dimensions
  const finalWidth = Math.max(1, scaledX2 - scaledX1);
  const finalHeight = Math.max(1, scaledY2 - scaledY1);

  return {
    x: scaledX1 / pageWidth,
    y: scaledY1 / pageHeight,
    width: finalWidth / pageWidth,
    height: finalHeight / pageHeight,
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

    // Construct full figure number with type prefix (e.g., "Figure 3", "Table 2")
    // pdffigures2 returns just the number in 'name' field, so we prepend the type
    const fullFigureNumber = `${fig.figType} ${fig.name}`;

    const detectedFigure: DetectedFigure = {
      figureNumber: fullFigureNumber,
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
