/**
 * ArXiv PDF URL Builder
 * https://info.arxiv.org/help/api/basics.html
 *
 * ArXiv provides free access to scientific preprints.
 * PDF URLs follow a consistent pattern based on the arXiv ID.
 */

/**
 * ArXiv ID formats:
 * - New format (2007+): YYMM.NNNNN (e.g., "2301.00001", "2312.12345v2")
 * - Old format (pre-2007): category/YYMMNNN (e.g., "hep-th/9901001", "cs.AI/0601001")
 */

/**
 * Validate arXiv ID format
 *
 * @param arxivId - ArXiv identifier to validate
 * @returns true if valid arXiv ID format
 */
export function isValidArxivId(arxivId: string): boolean {
  if (!arxivId || typeof arxivId !== 'string') {
    return false;
  }

  // Trim and clean the ID
  const cleanId = arxivId.trim();

  // New format: YYMM.NNNNN or YYMM.NNNNNvN (with optional version)
  const newFormatRegex = /^\d{4}\.\d{4,5}(v\d+)?$/;

  // Old format: category/YYMMNNN or category/YYMMNNNvN
  const oldFormatRegex =
    /^[a-z-]+(\.[a-zA-Z-]+)?\/\d{7}(v\d+)?$|^[a-z]+-[a-z]+\/\d{7}(v\d+)?$/;

  return newFormatRegex.test(cleanId) || oldFormatRegex.test(cleanId);
}

/**
 * Normalize arXiv ID by removing version suffix if present
 *
 * @param arxivId - ArXiv identifier (may include version like "2301.00001v2")
 * @returns Normalized arXiv ID without version suffix
 */
export function normalizeArxivId(arxivId: string): string {
  const cleanId = arxivId.trim();

  // Remove version suffix (v1, v2, etc.)
  return cleanId.replace(/v\d+$/, '');
}

/**
 * Build ArXiv PDF URL from arXiv ID
 *
 * @param arxivId - ArXiv identifier (e.g., "2301.00001" or "hep-th/9901001")
 * @returns Direct PDF download URL
 */
export function buildArxivPdfUrl(arxivId: string): string {
  if (!isValidArxivId(arxivId)) {
    throw new Error(`Invalid arXiv ID format: ${arxivId}`);
  }

  // Use the ID as-is (including version if specified)
  // ArXiv will serve the latest version if no version is specified
  const cleanId = arxivId.trim();

  // ArXiv PDF URL format
  // New format: https://arxiv.org/pdf/2301.00001.pdf
  // Old format: https://arxiv.org/pdf/hep-th/9901001.pdf
  return `https://arxiv.org/pdf/${cleanId}.pdf`;
}

/**
 * Build ArXiv abstract page URL from arXiv ID
 *
 * @param arxivId - ArXiv identifier
 * @returns Abstract page URL
 */
export function buildArxivAbsUrl(arxivId: string): string {
  if (!isValidArxivId(arxivId)) {
    throw new Error(`Invalid arXiv ID format: ${arxivId}`);
  }

  const cleanId = arxivId.trim();
  return `https://arxiv.org/abs/${cleanId}`;
}

/**
 * Extract arXiv ID from various URL formats
 *
 * @param url - ArXiv URL (abs, pdf, or export URL)
 * @returns Extracted arXiv ID or null if not a valid arXiv URL
 */
export function extractArxivIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    if (!urlObj.hostname.includes('arxiv.org')) {
      return null;
    }

    // Match patterns like /abs/2301.00001 or /pdf/2301.00001.pdf
    const pathMatch = urlObj.pathname.match(
      /\/(abs|pdf|e-print)\/([a-zA-Z\-.]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?(\.pdf)?$/
    );

    if (pathMatch) {
      // Return ID with version if present
      return pathMatch[2] + (pathMatch[3] || '');
    }

    return null;
  } catch {
    return null;
  }
}
