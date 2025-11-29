/**
 * PDF to Paper Matching Algorithm
 * Task 3.5.2: Match uploaded PDFs to failed papers in collection
 *
 * Strategy: Search paper's DOI/title inside PDF content
 * - More reliable than extracting metadata from PDF
 * - DOI is unique identifier, title is always present in PDF
 */

// pdf-parse v1.x - use require for CommonJS compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

export interface Paper {
  paper_id: string;
  title: string;
  doi?: string | null;
  external_ids?: {
    DOI?: string;
    ArXiv?: string;
    [key: string]: string | undefined;
  } | null;
  vector_status?: string | null;
  storage_path?: string | null;
}

export type MatchConfidence = 'high' | 'medium' | 'none';
export type MatchMethod = 'doi' | 'title' | 'none';

export interface MatchResult {
  paperId: string | null;
  paperTitle: string | null;
  confidence: MatchConfidence;
  matchMethod: MatchMethod;
}

export interface FileMatchResult {
  fileId: string;
  filename: string;
  tempStorageKey: string;
  match: MatchResult;
}

/**
 * Normalize text for comparison
 * - Lowercase
 * - Remove extra whitespace
 * - Remove common punctuation variations
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/['']/g, "'") // Normalize quotes
    .replace(/[""]/g, '"')
    .replace(/–/g, '-') // Normalize dashes
    .replace(/—/g, '-')
    .trim();
}

/**
 * Extract text content from PDF buffer
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse v1.x - simple function call with buffer
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('PDF text extraction failed:', error);
    return '';
  }
}

/**
 * Check if paper's DOI exists in PDF content
 */
function matchByDoi(paperDoi: string, pdfText: string): boolean {
  // DOI is case-insensitive
  const normalizedDoi = paperDoi.toLowerCase();
  const normalizedText = pdfText.toLowerCase();

  return normalizedText.includes(normalizedDoi);
}

/**
 * Check if paper's title exists in PDF content
 */
function matchByTitle(paperTitle: string, pdfText: string): boolean {
  const normalizedTitle = normalizeText(paperTitle);
  const normalizedText = normalizeText(pdfText);

  // Direct inclusion check
  if (normalizedText.includes(normalizedTitle)) {
    return true;
  }

  // Try matching first N words (handles subtitle variations)
  const titleWords = normalizedTitle.split(' ').filter(w => w.length > 2);
  if (titleWords.length >= 5) {
    const partialTitle = titleWords
      .slice(0, Math.min(8, titleWords.length))
      .join(' ');
    if (normalizedText.includes(partialTitle)) {
      return true;
    }
  }

  return false;
}

/**
 * Get papers that need PDFs (failed or pending status only)
 * Note: Only include papers that actually failed, not just those without storage_path
 */
function getFailedPapers(papers: Paper[]): Paper[] {
  return papers.filter(
    p => p.vector_status === 'failed' || p.vector_status === 'pending'
  );
}

/**
 * Get DOI from paper (handles both direct doi and external_ids)
 */
function getPaperDoi(paper: Paper): string | null {
  return paper.doi || paper.external_ids?.DOI || null;
}

/**
 * Match multiple PDFs to papers by searching paper info in PDF content
 */
export async function matchPdfsToPapers(
  files: Array<{
    fileId: string;
    filename: string;
    tempStorageKey: string;
    buffer: Buffer;
  }>,
  collectionPapers: Paper[]
): Promise<FileMatchResult[]> {
  const failedPapers = getFailedPapers(collectionPapers);

  console.log('[matcher] Total papers:', collectionPapers.length);
  console.log('[matcher] Failed papers needing PDFs:', failedPapers.length);
  console.log(
    '[matcher] Failed papers:',
    failedPapers.map(p => ({
      id: p.paper_id,
      title: p.title.substring(0, 50),
      doi: p.doi,
      vector_status: p.vector_status,
      storage_path: p.storage_path,
    }))
  );

  if (failedPapers.length === 0) {
    // No papers need PDFs, return all as unmatched
    return files.map(file => ({
      fileId: file.fileId,
      filename: file.filename,
      tempStorageKey: file.tempStorageKey,
      match: {
        paperId: null,
        paperTitle: null,
        confidence: 'none' as MatchConfidence,
        matchMethod: 'none' as MatchMethod,
      },
    }));
  }

  // Extract text from all PDFs in parallel
  const pdfTexts = await Promise.all(
    files.map(async file => ({
      fileId: file.fileId,
      filename: file.filename,
      tempStorageKey: file.tempStorageKey,
      text: await extractPdfText(file.buffer),
    }))
  );

  // Log PDF text extraction results
  for (const pdfData of pdfTexts) {
    console.log(
      `[matcher] PDF "${pdfData.filename}" text length: ${pdfData.text.length}`
    );
    if (pdfData.text.length > 0) {
      console.log(
        `[matcher] PDF "${pdfData.filename}" first 500 chars:`,
        pdfData.text.substring(0, 500)
      );
    }
  }

  const results: FileMatchResult[] = [];
  const matchedPaperIds = new Set<string>();
  const matchedFileIds = new Set<string>();

  // Sort papers: those with DOI first (DOI matching is more reliable than title matching)
  const sortedPapers = [...failedPapers].sort((a, b) => {
    const aHasDoi = getPaperDoi(a) !== null;
    const bHasDoi = getPaperDoi(b) !== null;
    if (aHasDoi && !bHasDoi) return -1;
    if (!aHasDoi && bHasDoi) return 1;
    return 0;
  });

  // For each failed paper, find matching PDF
  for (const paper of sortedPapers) {
    if (matchedPaperIds.has(paper.paper_id)) continue;

    const paperDoi = getPaperDoi(paper);
    console.log(
      `[matcher] Searching for paper: "${paper.title.substring(0, 50)}..." DOI: ${paperDoi}`
    );

    for (const pdfData of pdfTexts) {
      if (matchedFileIds.has(pdfData.fileId)) continue;
      if (!pdfData.text) continue;

      // 1st priority: DOI match (100% confidence)
      if (paperDoi) {
        const doiFound = matchByDoi(paperDoi, pdfData.text);
        console.log(
          `[matcher] DOI "${paperDoi}" in "${pdfData.filename}": ${doiFound}`
        );
      }
      if (paperDoi && matchByDoi(paperDoi, pdfData.text)) {
        results.push({
          fileId: pdfData.fileId,
          filename: pdfData.filename,
          tempStorageKey: pdfData.tempStorageKey,
          match: {
            paperId: paper.paper_id,
            paperTitle: paper.title,
            confidence: 'high',
            matchMethod: 'doi',
          },
        });
        matchedPaperIds.add(paper.paper_id);
        matchedFileIds.add(pdfData.fileId);
        break;
      }

      // 2nd priority: Title match (high confidence)
      if (matchByTitle(paper.title, pdfData.text)) {
        results.push({
          fileId: pdfData.fileId,
          filename: pdfData.filename,
          tempStorageKey: pdfData.tempStorageKey,
          match: {
            paperId: paper.paper_id,
            paperTitle: paper.title,
            confidence: 'high',
            matchMethod: 'title',
          },
        });
        matchedPaperIds.add(paper.paper_id);
        matchedFileIds.add(pdfData.fileId);
        break;
      }
    }
  }

  // Add unmatched files
  for (const pdfData of pdfTexts) {
    if (!matchedFileIds.has(pdfData.fileId)) {
      results.push({
        fileId: pdfData.fileId,
        filename: pdfData.filename,
        tempStorageKey: pdfData.tempStorageKey,
        match: {
          paperId: null,
          paperTitle: null,
          confidence: 'none',
          matchMethod: 'none',
        },
      });
    }
  }

  return results;
}

/**
 * Get papers that still need PDFs after matching
 */
export function getUnmatchedPapers(
  collectionPapers: Paper[],
  matchResults: FileMatchResult[]
): Array<{ paperId: string; title: string }> {
  const matchedPaperIds = new Set(
    matchResults.filter(r => r.match.paperId).map(r => r.match.paperId!)
  );

  return getFailedPapers(collectionPapers)
    .filter(p => !matchedPaperIds.has(p.paper_id))
    .map(p => ({ paperId: p.paper_id, title: p.title }));
}
