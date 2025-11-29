/**
 * PDF to Paper Matching Algorithm
 * Task 3.5.2: Match uploaded PDFs to papers in collection
 *
 * Matching priority:
 * 1. DOI exact match (high confidence)
 * 2. arXiv ID exact match (high confidence)
 * 3. Title similarity match (medium/high confidence based on score)
 * 4. No match found (manual selection required)
 */

import { ExtractedMetadata } from './metadata-extractor';

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
export type MatchMethod = 'doi' | 'arxiv' | 'title' | 'filename' | 'manual';

export interface MatchResult {
  paperId: string | null;
  paperTitle: string | null;
  confidence: MatchConfidence;
  matchMethod: MatchMethod;
  score?: number; // Similarity score for title matching (0-1)
}

export interface FileMatchResult {
  fileId: string;
  filename: string;
  tempStorageKey: string;
  match: MatchResult;
  extractedMetadata: ExtractedMetadata;
}

/**
 * Normalize string for comparison
 * Converts to lowercase, removes punctuation, normalizes whitespace
 */
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculate word-based Jaccard similarity between two strings
 * Returns a score between 0 and 1
 */
function calculateJaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    normalizeForComparison(a)
      .split(' ')
      .filter(w => w.length > 2)
  );
  const wordsB = new Set(
    normalizeForComparison(b)
      .split(' ')
      .filter(w => w.length > 2)
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set(Array.from(wordsA).filter(w => wordsB.has(w)));
  const union = new Set([...Array.from(wordsA), ...Array.from(wordsB)]);

  return intersection.size / union.size;
}

/**
 * Calculate n-gram based similarity for better fuzzy matching
 * Uses character trigrams for partial matches
 */
function calculateNgramSimilarity(a: string, b: string, n: number = 3): number {
  const aNorm = normalizeForComparison(a);
  const bNorm = normalizeForComparison(b);

  if (aNorm.length < n || bNorm.length < n) {
    return calculateJaccardSimilarity(a, b);
  }

  const getNgrams = (str: string): Set<string> => {
    const ngrams = new Set<string>();
    for (let i = 0; i <= str.length - n; i++) {
      ngrams.add(str.slice(i, i + n));
    }
    return ngrams;
  };

  const ngramsA = getNgrams(aNorm);
  const ngramsB = getNgrams(bNorm);

  const intersection = new Set(
    Array.from(ngramsA).filter(ng => ngramsB.has(ng))
  );
  const union = new Set([...Array.from(ngramsA), ...Array.from(ngramsB)]);

  return intersection.size / union.size;
}

/**
 * Combined similarity score using multiple methods
 */
function calculateSimilarity(a: string, b: string): number {
  const jaccardScore = calculateJaccardSimilarity(a, b);
  const ngramScore = calculateNgramSimilarity(a, b);

  // Weighted average: Jaccard for overall word match, n-gram for partial matches
  return jaccardScore * 0.6 + ngramScore * 0.4;
}

/**
 * Find the best title match among papers
 */
function findBestTitleMatch(
  title: string,
  papers: Paper[]
): { paper: Paper; score: number } | null {
  if (!title || papers.length === 0) return null;

  let bestMatch: { paper: Paper; score: number } | null = null;

  for (const paper of papers) {
    const score = calculateSimilarity(title, paper.title);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { paper, score };
    }
  }

  return bestMatch;
}

/**
 * Match a PDF to a paper in the collection based on extracted metadata
 *
 * @param metadata - Extracted metadata from PDF
 * @param collectionPapers - All papers in the collection
 * @param filterToFailed - If true, only match against papers needing PDFs
 * @returns Match result with confidence level
 */
export function matchPdfToPaper(
  metadata: ExtractedMetadata,
  collectionPapers: Paper[],
  filterToFailed: boolean = true
): MatchResult {
  // Filter to papers that need PDFs
  const candidates = filterToFailed
    ? collectionPapers.filter(
        p =>
          p.vector_status === 'failed' ||
          p.vector_status === 'pending' ||
          !p.storage_path
      )
    : collectionPapers;

  if (candidates.length === 0) {
    return {
      paperId: null,
      paperTitle: null,
      confidence: 'none',
      matchMethod: 'manual',
    };
  }

  // 1. DOI exact match (highest confidence)
  if (metadata.doi) {
    const normalizedDoi = metadata.doi.toLowerCase();
    const match = candidates.find(p => {
      const paperDoi =
        p.doi?.toLowerCase() || p.external_ids?.DOI?.toLowerCase();
      return paperDoi === normalizedDoi;
    });

    if (match) {
      return {
        paperId: match.paper_id,
        paperTitle: match.title,
        confidence: 'high',
        matchMethod: 'doi',
        score: 1.0,
      };
    }
  }

  // 2. arXiv ID exact match (high confidence)
  if (metadata.arxivId) {
    const normalizedArxiv = metadata.arxivId.toLowerCase().replace(/v\d+$/, ''); // Remove version
    const match = candidates.find(p => {
      const paperArxiv = p.external_ids?.ArXiv?.toLowerCase().replace(
        /v\d+$/,
        ''
      );
      return paperArxiv === normalizedArxiv;
    });

    if (match) {
      return {
        paperId: match.paper_id,
        paperTitle: match.title,
        confidence: 'high',
        matchMethod: 'arxiv',
        score: 1.0,
      };
    }
  }

  // 3. Title similarity match
  if (metadata.title) {
    const bestMatch = findBestTitleMatch(metadata.title, candidates);

    if (bestMatch && bestMatch.score > 0.5) {
      // Threshold for considering a match
      const confidence: MatchConfidence =
        bestMatch.score > 0.8 ? 'high' : 'medium';
      const matchMethod: MatchMethod =
        metadata.extractionMethod === 'filename' ? 'filename' : 'title';

      return {
        paperId: bestMatch.paper.paper_id,
        paperTitle: bestMatch.paper.title,
        confidence,
        matchMethod,
        score: bestMatch.score,
      };
    }
  }

  // 4. No match found
  return {
    paperId: null,
    paperTitle: null,
    confidence: 'none',
    matchMethod: 'manual',
  };
}

/**
 * Match multiple PDFs to papers in collection
 *
 * @param files - Array of file metadata results
 * @param collectionPapers - All papers in the collection
 * @returns Array of match results
 */
export function matchPdfsToPapers(
  files: Array<{
    fileId: string;
    filename: string;
    tempStorageKey: string;
    metadata: ExtractedMetadata;
  }>,
  collectionPapers: Paper[]
): FileMatchResult[] {
  // Track which papers have been matched to avoid duplicates
  const matchedPaperIds = new Set<string>();

  return files.map(file => {
    // Filter out already matched papers for unique matching
    const availablePapers = collectionPapers.filter(
      p => !matchedPaperIds.has(p.paper_id)
    );

    const match = matchPdfToPaper(file.metadata, availablePapers, true);

    // Mark paper as matched if found
    if (match.paperId) {
      matchedPaperIds.add(match.paperId);
    }

    return {
      fileId: file.fileId,
      filename: file.filename,
      tempStorageKey: file.tempStorageKey,
      match,
      extractedMetadata: file.metadata,
    };
  });
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

  return collectionPapers
    .filter(p => {
      const needsPdf =
        p.vector_status === 'failed' ||
        p.vector_status === 'pending' ||
        !p.storage_path;
      const notMatched = !matchedPaperIds.has(p.paper_id);
      return needsPdf && notMatched;
    })
    .map(p => ({ paperId: p.paper_id, title: p.title }));
}
