/**
 * PDF Metadata Extraction Library
 * Task 3.5.1: Extract DOI, arXiv ID, and title from PDF files
 *
 * Extraction priority:
 * 1. DOI from PDF text (~95% accuracy when present)
 * 2. arXiv ID from PDF text (~99% accuracy when present)
 * 3. Title from first page text (~70% accuracy)
 * 4. Filename fallback (normalized)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse');

// DOI pattern: 10.xxxx/xxxxx
// Matches various DOI formats including those with special characters
const DOI_REGEX = /\b(10\.\d{4,}(?:\.\d+)*\/(?:(?!["&'<>])\S)+)\b/gi;

// arXiv patterns:
// - arXiv:1234.56789 or arXiv:1234.56789v1
// - arxiv.org/abs/1234.56789
// - Old format: arXiv:hep-th/9901001
const ARXIV_REGEX =
  /arXiv:(\d{4}\.\d{4,5}(?:v\d+)?)|arxiv\.org\/abs\/(\d{4}\.\d{4,5}(?:v\d+)?)|arXiv:([a-z-]+\/\d{7}(?:v\d+)?)/gi;

export interface ExtractedMetadata {
  doi?: string;
  arxivId?: string;
  title?: string;
  extractionMethod: 'doi' | 'arxiv' | 'title' | 'filename';
  rawText?: string; // First 1000 chars for debugging
}

export interface ExtractionResult {
  success: boolean;
  metadata: ExtractedMetadata;
  error?: string;
}

/**
 * Normalize a filename to extract potential title
 * Removes extension, replaces separators with spaces, cleans up
 */
export function normalizeFilename(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '') // Remove .pdf extension
    .replace(/[_-]/g, ' ') // Replace underscores and dashes with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .replace(/^\d+\s*/, '') // Remove leading numbers (e.g., "01 paper.pdf")
    .trim();
}

/**
 * Extract title from PDF text
 * Attempts to find the title by looking at the first few lines
 * Typically the title is in larger font and appears first
 */
function extractTitleFromText(text: string): string | undefined {
  if (!text || text.length < 10) return undefined;

  // Get the first portion of text (usually contains title)
  const firstPart = text.slice(0, 2000);

  // Split into lines and find potential title candidates
  const lines = firstPart
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 10 && line.length < 300);

  if (lines.length === 0) return undefined;

  // First non-empty line that looks like a title
  // Exclude lines that look like headers, affiliations, or metadata
  const excludePatterns = [
    /^abstract/i,
    /^introduction/i,
    /^keywords?:/i,
    /^\d+\./,
    /^volume\s+\d+/i,
    /^page\s+\d+/i,
    /university|institute|department/i,
    /^\s*\d{4}\s*$/, // Just a year
    /^http/i,
    /^doi:/i,
    /^arxiv:/i,
    /@/,
    /^\([^)]+\)$/, // Just parenthetical content
  ];

  for (const line of lines.slice(0, 10)) {
    // Check first 10 lines
    const isExcluded = excludePatterns.some(pattern => pattern.test(line));
    if (!isExcluded && line.length >= 15) {
      // Clean up the line
      const cleaned = line
        .replace(/\s+/g, ' ')
        .replace(/^\W+|\W+$/g, '') // Remove leading/trailing non-word chars
        .trim();

      if (cleaned.length >= 15) {
        return cleaned;
      }
    }
  }

  return undefined;
}

/**
 * Extract DOI from PDF text
 */
function extractDoi(text: string): string | undefined {
  const matches = text.match(DOI_REGEX);
  if (matches && matches.length > 0) {
    // Clean up the DOI (remove trailing punctuation)
    let doi = matches[0];
    doi = doi.replace(/[.,;)>\]]+$/, '');
    return doi;
  }
  return undefined;
}

/**
 * Extract arXiv ID from PDF text
 */
function extractArxivId(text: string): string | undefined {
  const matches = Array.from(text.matchAll(ARXIV_REGEX));
  if (matches.length > 0) {
    // Return the first captured group that exists
    for (const match of matches) {
      if (match[1]) return match[1]; // New format: 1234.56789
      if (match[2]) return match[2]; // From URL
      if (match[3]) return match[3]; // Old format: hep-th/9901001
    }
  }
  return undefined;
}

/**
 * Extract metadata from PDF buffer
 * Tries multiple extraction methods with fallback
 *
 * @param buffer - PDF file as Buffer
 * @param filename - Original filename (used as fallback)
 * @returns Extraction result with metadata
 */
export async function extractMetadata(
  buffer: Buffer,
  filename: string
): Promise<ExtractionResult> {
  try {
    // Parse PDF to extract text
    const pdfData = await pdf(buffer);
    const text = pdfData.text || '';

    // 1. Try DOI extraction (highest confidence)
    const doi = extractDoi(text);
    if (doi) {
      return {
        success: true,
        metadata: {
          doi,
          extractionMethod: 'doi',
          rawText: text.slice(0, 1000),
        },
      };
    }

    // 2. Try arXiv ID extraction (high confidence)
    const arxivId = extractArxivId(text);
    if (arxivId) {
      return {
        success: true,
        metadata: {
          arxivId,
          extractionMethod: 'arxiv',
          rawText: text.slice(0, 1000),
        },
      };
    }

    // 3. Try title extraction from text
    const title = extractTitleFromText(text);
    if (title) {
      return {
        success: true,
        metadata: {
          title,
          extractionMethod: 'title',
          rawText: text.slice(0, 1000),
        },
      };
    }

    // 4. Fallback to filename
    const normalizedFilename = normalizeFilename(filename);
    return {
      success: true,
      metadata: {
        title: normalizedFilename,
        extractionMethod: 'filename',
      },
    };
  } catch (error) {
    // PDF parsing failed, use filename fallback
    console.warn(`PDF parsing failed for ${filename}:`, error);

    return {
      success: true, // Still considered success since we have filename fallback
      metadata: {
        title: normalizeFilename(filename),
        extractionMethod: 'filename',
      },
      error: error instanceof Error ? error.message : 'PDF parsing failed',
    };
  }
}

/**
 * Batch extract metadata from multiple PDFs
 * Processes in parallel with concurrency limit
 */
export async function extractMetadataBatch(
  files: Array<{ buffer: Buffer; filename: string }>,
  concurrency: number = 5
): Promise<Array<{ filename: string; result: ExtractionResult }>> {
  const results: Array<{ filename: string; result: ExtractionResult }> = [];

  // Process in chunks for controlled concurrency
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async file => ({
        filename: file.filename,
        result: await extractMetadata(file.buffer, file.filename),
      }))
    );
    results.push(...chunkResults);
  }

  return results;
}
