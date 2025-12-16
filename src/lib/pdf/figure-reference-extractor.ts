/**
 * Figure Reference Extractor
 *
 * Extracts and normalizes figure/table references from text chunks.
 * Supports patterns like "Figure 1", "Fig. 2a", "Figures 1-3", "Table 1", etc.
 */

export interface FigureReference {
  original: string; // Original text (e.g., "Fig. 2a")
  normalized: string; // Normalized form (e.g., "Figure 2a")
}

// Figure reference patterns
const FIGURE_PATTERNS = [
  // "Figure 1", "Figure 1a", "Figure 1-3", "Figure S1" (supplementary)
  /\bFigure\s*(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?|S\d+[a-z]?)/gi,
  // "Fig. 1", "Fig 2a", "Figs. 1-3", "Fig. S1"
  /\bFigs?\.?\s*(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?|S\d+[a-z]?)/gi,
  // "Table 1", "Tables 1-3"
  /\bTables?\s*(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?|S\d+[a-z]?)/gi,
  // "Scheme 1" (common in chemistry papers)
  /\bSchemes?\s*(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?)/gi,
  // "Chart 1"
  /\bCharts?\s*(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?)/gi,
];

/**
 * Extract figure references from text
 */
export function extractFigureReferences(text: string): FigureReference[] {
  const references: FigureReference[] = [];
  const seen = new Set<string>();

  for (const pattern of FIGURE_PATTERNS) {
    // Reset regex lastIndex for each pattern
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const original = match[0].trim();
      const normalized = normalizeFigureReference(original);

      if (!seen.has(normalized.toLowerCase())) {
        seen.add(normalized.toLowerCase());
        references.push({ original, normalized });
      }
    }
  }

  return references;
}

/**
 * Normalize a figure reference to standard form
 * - "Fig. 1" → "Figure 1"
 * - "Figs. 1-3" → "Figure 1-3"
 * - "TABLE 2" → "Table 2"
 */
export function normalizeFigureReference(ref: string): string {
  let normalized = ref
    // Normalize "Fig." variants to "Figure" (but not "Figure" itself)
    // Using negative lookahead (?!ure) to avoid matching "Figure"
    .replace(/\bFig(?!ure)s?\.?\s*/gi, 'Figure ')
    // Normalize "Tables" to "Table"
    .replace(/\bTables\b/gi, 'Table')
    // Normalize "Schemes" to "Scheme"
    .replace(/\bSchemes\b/gi, 'Scheme')
    // Normalize "Charts" to "Chart"
    .replace(/\bCharts\b/gi, 'Chart')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize first letter of each word properly
  normalized = normalized.replace(
    /\b(figure|table|scheme|chart)\b/gi,
    match => {
      return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
    }
  );

  return normalized;
}

/**
 * Expand range references like "Figure 1-3" into individual references
 * Returns ["Figure 1", "Figure 2", "Figure 3"]
 */
export function expandFigureRange(ref: string): string[] {
  const rangeMatch = ref.match(
    /^(Figure|Table|Scheme|Chart)\s*(\d+)\s*[-–]\s*(\d+)$/i
  );

  if (rangeMatch) {
    const [, type, start, end] = rangeMatch;
    const startNum = parseInt(start, 10);
    const endNum = parseInt(end, 10);
    const result: string[] = [];

    // Limit expansion to prevent abuse (max 10 items)
    const maxRange = Math.min(endNum, startNum + 10);

    for (let i = startNum; i <= maxRange; i++) {
      result.push(
        `${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()} ${i}`
      );
    }
    return result;
  }

  return [ref];
}

/**
 * Extract all unique figure references from text, with ranges expanded
 */
export function extractAllFigureReferences(text: string): string[] {
  const refs = extractFigureReferences(text);
  const expanded = refs.flatMap(r => expandFigureRange(r.normalized));
  return Array.from(new Set(expanded));
}

/**
 * Check if a figure number matches another (case-insensitive, handles variants)
 */
export function figureNumbersMatch(fig1: string, fig2: string): boolean {
  const norm1 = normalizeFigureReference(fig1).toLowerCase();
  const norm2 = normalizeFigureReference(fig2).toLowerCase();
  return norm1 === norm2;
}
