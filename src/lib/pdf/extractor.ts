/**
 * PDF Text Extractor for Custom RAG
 *
 * Extracts and cleans text content from PDF files for chunking and embedding.
 */

// pdf-parse v1.x - use require for CommonJS compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

export interface ExtractedPdf {
  text: string;
  numPages: number;
  metadata: Record<string, unknown>;
}

/**
 * Extract text content from a PDF buffer
 *
 * @param buffer - PDF file as a Buffer
 * @returns Promise with extracted text, page count, and metadata
 * @throws Error if PDF extraction fails
 *
 * @example
 * ```typescript
 * const pdfBuffer = await fs.readFile('paper.pdf');
 * const { text, numPages } = await extractTextFromPdf(pdfBuffer);
 * console.log(`Extracted ${text.length} chars from ${numPages} pages`);
 * ```
 */
export async function extractTextFromPdf(
  buffer: Buffer
): Promise<ExtractedPdf> {
  try {
    const result = await pdfParse(buffer);
    return {
      text: cleanText(result.text || ''),
      numPages: result.numpages || 0,
      metadata: result.info || {},
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`PDF extraction failed: ${errorMessage}`);
  }
}

/**
 * Clean extracted text for better chunking
 *
 * - Normalizes whitespace
 * - Removes excessive line breaks
 * - Trims leading/trailing whitespace
 */
function cleanText(text: string): string {
  return (
    text
      // Replace multiple spaces/tabs with single space
      .replace(/[ \t]+/g, ' ')
      // Replace 3+ consecutive newlines with double newline (paragraph break)
      .replace(/\n{3,}/g, '\n\n')
      // Remove spaces before/after newlines
      .replace(/ *\n */g, '\n')
      // Trim
      .trim()
  );
}

/**
 * Check if PDF buffer is valid and can be parsed
 *
 * @param buffer - PDF file as a Buffer
 * @returns Promise<boolean> indicating if PDF is valid
 */
export async function isValidPdf(buffer: Buffer): Promise<boolean> {
  try {
    // Check PDF magic bytes
    if (buffer.length < 4) return false;
    const header = buffer.slice(0, 4).toString('ascii');
    if (header !== '%PDF') return false;

    // Try to parse
    const result = await pdfParse(buffer);
    return result && result.text && result.numpages > 0;
  } catch {
    return false;
  }
}
