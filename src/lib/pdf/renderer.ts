/**
 * PDF Page Renderer
 *
 * Renders PDF pages to images using pdf-poppler.
 * Used for figure detection and extraction in multimodal RAG.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

export interface RenderedPage {
  pageNumber: number;
  imageBuffer: Buffer;
  width: number;
  height: number;
}

export interface RenderOptions {
  /** DPI for rendering (72 = 1x, 144 = 2x, 300 = print quality) */
  dpi: number;
  /** Image format */
  format: 'png' | 'jpeg';
  /** JPEG quality (1-100), only for jpeg format */
  quality: number;
}

const DEFAULT_OPTIONS: RenderOptions = {
  dpi: 150, // Good balance of quality and size for figure extraction
  format: 'png',
  quality: 90,
};

/**
 * Render all pages of a PDF to images
 *
 * @param pdfBuffer - PDF file as Buffer
 * @param options - Render options (dpi, format)
 * @returns Array of rendered pages with image buffers
 *
 * @example
 * ```typescript
 * const pdfBuffer = await fs.readFile('paper.pdf');
 * const pages = await renderPdfPages(pdfBuffer);
 * for (const page of pages) {
 *   await fs.writeFile(`page-${page.pageNumber}.png`, page.imageBuffer);
 * }
 * ```
 */
export async function renderPdfPages(
  pdfBuffer: Buffer,
  options: Partial<RenderOptions> = {}
): Promise<RenderedPage[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tempDir = await createTempDir();

  try {
    // Write PDF to temp file
    const pdfPath = path.join(tempDir, 'input.pdf');
    await fs.writeFile(pdfPath, pdfBuffer);

    // Get page count
    const pageCount = await getPdfPageCountFromFile(pdfPath);

    // Render all pages
    const outputPrefix = path.join(tempDir, 'page');
    await renderWithPoppler(pdfPath, outputPrefix, opts);

    // Read rendered images
    const pages: RenderedPage[] = [];
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const imagePath = await findRenderedFile(
        outputPrefix,
        pageNum,
        opts.format
      );

      if (!imagePath) {
        console.warn(`Rendered file not found for page ${pageNum}`);
        continue;
      }

      try {
        const imageBuffer = await fs.readFile(imagePath);
        const dimensions = await getImageDimensionsFromBuffer(imageBuffer);

        pages.push({
          pageNumber: pageNum,
          imageBuffer,
          width: dimensions.width,
          height: dimensions.height,
        });
      } catch (error) {
        console.warn(`Failed to read rendered page ${pageNum}:`, error);
      }
    }

    return pages;
  } finally {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Render a single page from a PDF
 *
 * @param pdfBuffer - PDF file as Buffer
 * @param pageNumber - Page number to render (1-indexed)
 * @param options - Render options
 * @returns Rendered page with image buffer
 */
export async function renderSinglePage(
  pdfBuffer: Buffer,
  pageNumber: number,
  options: Partial<RenderOptions> = {}
): Promise<RenderedPage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tempDir = await createTempDir();

  try {
    const pdfPath = path.join(tempDir, 'input.pdf');
    await fs.writeFile(pdfPath, pdfBuffer);

    const outputPrefix = path.join(tempDir, 'page');
    await renderWithPoppler(
      pdfPath,
      outputPrefix,
      opts,
      pageNumber,
      pageNumber
    );

    const imagePath = await findRenderedFile(
      outputPrefix,
      pageNumber,
      opts.format
    );
    if (!imagePath) {
      throw new Error(`Failed to render page ${pageNumber}`);
    }
    const imageBuffer = await fs.readFile(imagePath);
    const dimensions = await getImageDimensionsFromBuffer(imageBuffer);

    return {
      pageNumber,
      imageBuffer,
      width: dimensions.width,
      height: dimensions.height,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Generator for streaming page rendering (memory efficient for large PDFs)
 *
 * @param pdfBuffer - PDF file as Buffer
 * @param options - Render options
 * @yields Rendered pages one at a time
 *
 * @example
 * ```typescript
 * for await (const page of renderPdfPagesStream(pdfBuffer)) {
 *   // Process each page without loading all into memory
 *   await processPage(page);
 * }
 * ```
 */
export async function* renderPdfPagesStream(
  pdfBuffer: Buffer,
  options: Partial<RenderOptions> = {}
): AsyncGenerator<RenderedPage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tempDir = await createTempDir();

  try {
    const pdfPath = path.join(tempDir, 'input.pdf');
    await fs.writeFile(pdfPath, pdfBuffer);

    const pageCount = await getPdfPageCountFromFile(pdfPath);

    // Render pages one at a time for memory efficiency
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const outputPrefix = path.join(tempDir, `page-${pageNum}`);
      await renderWithPoppler(pdfPath, outputPrefix, opts, pageNum, pageNum);

      const imagePath = await findRenderedFile(
        outputPrefix,
        pageNum,
        opts.format
      );

      if (!imagePath) {
        console.warn(`Rendered file not found for page ${pageNum}`);
        continue;
      }

      try {
        const imageBuffer = await fs.readFile(imagePath);
        const dimensions = await getImageDimensionsFromBuffer(imageBuffer);

        yield {
          pageNumber: pageNum,
          imageBuffer,
          width: dimensions.width,
          height: dimensions.height,
        };

        // Delete the image after yielding to save memory
        await fs.unlink(imagePath);
      } catch (error) {
        console.warn(`Failed to read rendered page ${pageNum}:`, error);
      }
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Get PDF page count without rendering
 *
 * @param pdfBuffer - PDF file as Buffer
 * @returns Number of pages in the PDF
 */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const tempDir = await createTempDir();

  try {
    const pdfPath = path.join(tempDir, 'input.pdf');
    await fs.writeFile(pdfPath, pdfBuffer);
    return await getPdfPageCountFromFile(pdfPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Render PDF pages using pdftoppm (Poppler)
 */
async function renderWithPoppler(
  pdfPath: string,
  outputPrefix: string,
  options: RenderOptions,
  firstPage?: number,
  lastPage?: number
): Promise<void> {
  const args: string[] = ['-r', options.dpi.toString()];

  // Format
  if (options.format === 'png') {
    args.push('-png');
  } else {
    args.push('-jpeg');
    args.push('-jpegopt', `quality=${options.quality}`);
  }

  // Page range
  if (firstPage !== undefined) {
    args.push('-f', firstPage.toString());
  }
  if (lastPage !== undefined) {
    args.push('-l', lastPage.toString());
  }

  // Input and output
  args.push(pdfPath, outputPrefix);

  try {
    await execFileAsync('pdftoppm', args);
  } catch (error: unknown) {
    const execError = error as { code?: string; message?: string };
    if (execError.code === 'ENOENT') {
      throw new Error(
        'pdftoppm not found. Please install poppler-utils:\n' +
          '  macOS: brew install poppler\n' +
          '  Ubuntu: apt-get install poppler-utils\n' +
          '  Windows: Download from https://github.com/oschwartz10612/poppler-windows'
      );
    }
    throw error;
  }
}

/**
 * Get page count using pdfinfo (Poppler)
 */
async function getPdfPageCountFromFile(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
    const match = stdout.match(/Pages:\s+(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    throw new Error('Could not parse page count from pdfinfo output');
  } catch (error: unknown) {
    const execError = error as { code?: string };
    if (execError.code === 'ENOENT') {
      throw new Error(
        'pdfinfo not found. Please install poppler-utils:\n' +
          '  macOS: brew install poppler\n' +
          '  Ubuntu: apt-get install poppler-utils'
      );
    }
    throw error;
  }
}

/**
 * Create a temporary directory for PDF processing
 */
async function createTempDir(): Promise<string> {
  const tempBase = path.join(os.tmpdir(), 'citebite-pdf');
  await fs.mkdir(tempBase, { recursive: true });
  const tempDir = path.join(tempBase, randomUUID());
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Get image dimensions from buffer using sharp
 */
async function getImageDimensionsFromBuffer(
  buffer: Buffer
): Promise<{ width: number; height: number }> {
  // Dynamic import to avoid issues if sharp is not available
  const sharp = (await import('sharp')).default;
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
  };
}

/**
 * Find the actual output file from pdftoppm
 * Handles different padding patterns
 */
export async function findRenderedFile(
  prefix: string,
  pageNumber: number,
  format: 'png' | 'jpeg'
): Promise<string | null> {
  const ext = format === 'png' ? 'png' : 'jpg';
  const dir = path.dirname(prefix);
  const baseName = path.basename(prefix);

  try {
    const files = await fs.readdir(dir);
    const pattern = new RegExp(`^${baseName}-0*${pageNumber}\\.${ext}$`);
    const match = files.find(f => pattern.test(f));
    return match ? path.join(dir, match) : null;
  } catch {
    return null;
  }
}
