/**
 * Figure Image Extractor
 *
 * Crops detected figures from page images using Sharp.
 * Produces clean, isolated figure images for storage and display.
 */

import sharp from 'sharp';
import { DetectedFigure, BoundingBox } from './figure-types';
import { normalizeFigureReference } from './figure-reference-extractor';

export interface CroppedFigure {
  /** Original figure number from detection */
  figureNumber: string;
  /** Normalized figure number for matching (e.g., "Figure 1") */
  normalizedFigureNumber: string;
  /** Caption text */
  caption: string;
  /** Figure type */
  type: 'chart' | 'diagram' | 'image' | 'table' | 'other';
  /** Cropped image as PNG buffer */
  imageBuffer: Buffer;
  /** Page number where figure was found */
  pageNumber: number;
  /** Original bounding box (for reference) */
  boundingBox: BoundingBox;
}

export interface CropOptions {
  /** Padding around the figure as percentage (0.05 = 5%) */
  padding: number;
  /** Output format */
  format: 'png' | 'jpeg';
  /** JPEG quality (1-100), only for jpeg format */
  quality: number;
  /** Maximum width for output image (maintains aspect ratio) */
  maxWidth?: number;
}

const DEFAULT_CROP_OPTIONS: CropOptions = {
  padding: 0.02, // 2% padding
  format: 'png',
  quality: 90,
  maxWidth: 1200, // Max 1200px width for storage efficiency
};

/**
 * Extract (crop) a single figure from a page image
 *
 * @param pageImage - Full page image as Buffer
 * @param pageWidth - Page width in pixels
 * @param pageHeight - Page height in pixels
 * @param figure - Detected figure with bounding box
 * @param pageNumber - Page number for reference
 * @param options - Crop options
 * @returns Cropped figure with image buffer
 *
 * @example
 * ```typescript
 * const cropped = await extractFigureImage(
 *   pageBuffer, 1200, 1600,
 *   detectedFigure, 1
 * );
 * await fs.writeFile('figure-1.png', cropped.imageBuffer);
 * ```
 */
export async function extractFigureImage(
  pageImage: Buffer,
  pageWidth: number,
  pageHeight: number,
  figure: DetectedFigure,
  pageNumber: number,
  options: Partial<CropOptions> = {}
): Promise<CroppedFigure> {
  const opts = { ...DEFAULT_CROP_OPTIONS, ...options };
  const { boundingBox } = figure;

  // Calculate pixel coordinates from normalized values
  const region = calculateCropRegion(
    boundingBox,
    pageWidth,
    pageHeight,
    opts.padding
  );

  // Create Sharp instance and crop
  let sharpInstance = sharp(pageImage).extract(region);

  // Resize if exceeds max width
  if (opts.maxWidth && region.width > opts.maxWidth) {
    sharpInstance = sharpInstance.resize({
      width: opts.maxWidth,
      withoutEnlargement: true,
    });
  }

  // Convert to output format
  let imageBuffer: Buffer;
  if (opts.format === 'jpeg') {
    imageBuffer = await sharpInstance
      .jpeg({ quality: opts.quality })
      .toBuffer();
  } else {
    imageBuffer = await sharpInstance.png().toBuffer();
  }

  return {
    figureNumber: figure.figureNumber,
    normalizedFigureNumber: normalizeFigureReference(figure.figureNumber),
    caption: figure.caption,
    type: figure.type,
    imageBuffer,
    pageNumber,
    boundingBox: figure.boundingBox,
  };
}

/**
 * Extract multiple figures from a page
 *
 * @param pageImage - Full page image as Buffer
 * @param pageWidth - Page width in pixels
 * @param pageHeight - Page height in pixels
 * @param figures - Array of detected figures
 * @param pageNumber - Page number
 * @param options - Crop options
 * @returns Array of cropped figures
 */
export async function extractFiguresFromPage(
  pageImage: Buffer,
  pageWidth: number,
  pageHeight: number,
  figures: DetectedFigure[],
  pageNumber: number,
  options: Partial<CropOptions> = {}
): Promise<CroppedFigure[]> {
  const results: CroppedFigure[] = [];

  for (const figure of figures) {
    try {
      const cropped = await extractFigureImage(
        pageImage,
        pageWidth,
        pageHeight,
        figure,
        pageNumber,
        options
      );
      results.push(cropped);
    } catch (error) {
      console.warn(
        `Failed to extract ${figure.figureNumber} from page ${pageNumber}:`,
        error
      );
      // Continue with other figures
    }
  }

  return results;
}

/**
 * Calculate the crop region in pixels with padding
 */
function calculateCropRegion(
  boundingBox: BoundingBox,
  pageWidth: number,
  pageHeight: number,
  padding: number
): { left: number; top: number; width: number; height: number } {
  // Convert normalized coordinates to pixels
  const rawLeft = boundingBox.x * pageWidth;
  const rawTop = boundingBox.y * pageHeight;
  const rawWidth = boundingBox.width * pageWidth;
  const rawHeight = boundingBox.height * pageHeight;

  // Add padding
  const paddingX = rawWidth * padding;
  const paddingY = rawHeight * padding;

  // Calculate padded region, ensuring it stays within bounds
  const left = Math.max(0, Math.round(rawLeft - paddingX));
  const top = Math.max(0, Math.round(rawTop - paddingY));
  const right = Math.min(pageWidth, Math.round(rawLeft + rawWidth + paddingX));
  const bottom = Math.min(
    pageHeight,
    Math.round(rawTop + rawHeight + paddingY)
  );

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * Optimize figure image for storage
 * - Converts to PNG with compression
 * - Resizes if too large
 *
 * @param imageBuffer - Original image buffer
 * @param maxWidth - Maximum width (default: 1200)
 * @returns Optimized image buffer
 */
export async function optimizeFigureImage(
  imageBuffer: Buffer,
  maxWidth: number = 1200
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();

  let sharpInstance = sharp(imageBuffer);

  // Resize if needed
  if (metadata.width && metadata.width > maxWidth) {
    sharpInstance = sharpInstance.resize({
      width: maxWidth,
      withoutEnlargement: true,
    });
  }

  // Optimize PNG
  return sharpInstance
    .png({
      compressionLevel: 9,
      palette: true, // Use palette for smaller files when possible
    })
    .toBuffer();
}

/**
 * Get image dimensions from buffer
 */
export async function getImageDimensions(
  imageBuffer: Buffer
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(imageBuffer).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
  };
}
