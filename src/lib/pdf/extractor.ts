/**
 * PDF Text Extractor for Custom RAG
 *
 * Extracts and cleans text content from PDF files for chunking and embedding.
 */

// pdf-parse v1.x - use require for CommonJS compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

/**
 * Regex to detect reference section headings in academic papers.
 *
 * Matches patterns like:
 * - "References", "REFERENCES", "references"
 * - "Bibliography", "BIBLIOGRAPHY"
 * - "Works Cited", "Literature Cited", "Citations"
 * - "7. References", "8 References" (numbered sections)
 * - "VI. References", "VII References" (Roman numeral sections)
 *
 * Uses line anchors to avoid matching inline mentions like "See References [1-5]"
 */
const REFERENCE_SECTION_PATTERN =
  /^(?:\d+\.?\s*)?(?:[IVXLCDM]+\.?\s*)?(references|bibliography|works\s+cited|literature\s+cited|citations)\s*$/im;

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

    // Clean text and remove references section
    let text = cleanText(result.text || '');
    text = removeReferencesSection(text);

    return {
      text,
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
 * Remove the references section and all content after it from extracted text.
 *
 * Academic papers typically end with a references section that contains
 * citation lists which are not useful for RAG retrieval and can introduce
 * noise in embeddings. This also removes appendices that come after references.
 *
 * @param text - The full extracted text from PDF
 * @returns Text with references section removed, or original if no references found
 */
function removeReferencesSection(text: string): string {
  const match = text.match(REFERENCE_SECTION_PATTERN);

  if (!match || match.index === undefined) {
    // No references section found, return original text
    return text;
  }

  // Find the start of the line containing the references heading
  const matchIndex = match.index;
  let lineStart = matchIndex;

  // Walk backwards to find the start of the line
  while (lineStart > 0 && text[lineStart - 1] !== '\n') {
    lineStart--;
  }

  // Truncate at the start of the references line
  const truncatedText = text.slice(0, lineStart).trim();

  // Safety check: don't truncate if result is suspiciously short
  // This handles edge cases like title containing "References"
  if (truncatedText.length < 500) {
    return text;
  }

  return truncatedText;
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
