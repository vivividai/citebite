/**
 * Figure Detector
 *
 * Uses Gemini Vision API to detect figures, charts, diagrams, and tables
 * in rendered PDF page images.
 */

import { getGeminiClient, withGeminiErrorHandling } from '@/lib/gemini/client';
import { normalizeFigureReference } from './figure-reference-extractor';

export interface BoundingBox {
  /** X coordinate (0-1, normalized) */
  x: number;
  /** Y coordinate (0-1, normalized) */
  y: number;
  /** Width (0-1, normalized) */
  width: number;
  /** Height (0-1, normalized) */
  height: number;
}

export interface DetectedFigure {
  /** Figure identifier (e.g., "Figure 1", "Table 2") */
  figureNumber: string;
  /** Caption text from below/above the figure */
  caption: string;
  /** Bounding box in normalized coordinates (0-1) */
  boundingBox: BoundingBox;
  /** Type of visual element */
  type: 'chart' | 'diagram' | 'image' | 'table' | 'other';
}

export interface PageAnalysis {
  pageNumber: number;
  figures: DetectedFigure[];
}

const FIGURE_DETECTION_PROMPT = `Analyze this academic paper page and identify all figures, charts, diagrams, and tables.

For each visual element found, provide:
1. Figure number (e.g., "Figure 1", "Fig. 2a", "Table 1")
2. Caption text (the description below or above the figure)
3. Bounding box coordinates (x, y, width, height as percentages 0-1 of page dimensions)
   - x: left edge position (0 = left edge, 1 = right edge)
   - y: top edge position (0 = top edge, 1 = bottom edge)
   - width: figure width as fraction of page width
   - height: figure height as fraction of page height
4. Type: chart | diagram | image | table | other

Return JSON array format ONLY (no markdown code blocks, no explanation):
[
  {
    "figureNumber": "Figure 1",
    "caption": "Overview of the proposed architecture...",
    "boundingBox": {"x": 0.1, "y": 0.3, "width": 0.8, "height": 0.4},
    "type": "diagram"
  }
]

If no figures are found, return: []

Important:
- Include ALL visual elements (figures, charts, tables, diagrams, graphs)
- Extract the COMPLETE caption text
- Be precise with bounding box coordinates
- For subfigures like "(a)" "(b)", try to include the parent figure number
- Return ONLY valid JSON, no markdown formatting`;

/**
 * Detect figures in a single PDF page image
 *
 * @param pageImage - Page image as Buffer (PNG or JPEG)
 * @param pageNumber - Page number for reference
 * @returns PageAnalysis with detected figures
 *
 * @example
 * ```typescript
 * const analysis = await detectFiguresInPage(pageImageBuffer, 1);
 * console.log(`Found ${analysis.figures.length} figures on page 1`);
 * ```
 */
export async function detectFiguresInPage(
  pageImage: Buffer,
  pageNumber: number
): Promise<PageAnalysis> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: pageImage.toString('base64'),
              },
            },
            { text: FIGURE_DETECTION_PROMPT },
          ],
        },
      ],
      config: {
        temperature: 0.1, // Low temperature for consistent detection
        maxOutputTokens: 4096,
      },
    });

    const text = response.text || '[]';
    const figures = parseFigureDetectionResponse(text);

    return {
      pageNumber,
      figures: figures.filter(isValidFigure),
    };
  });
}

/**
 * Detect figures in multiple pages (batch processing)
 *
 * @param pages - Array of { pageNumber, imageBuffer }
 * @param concurrency - Max concurrent requests (default: 3)
 * @returns Array of PageAnalysis for each page
 */
export async function detectFiguresInPages(
  pages: { pageNumber: number; imageBuffer: Buffer }[],
  concurrency: number = 3
): Promise<PageAnalysis[]> {
  const results: PageAnalysis[] = [];

  // Process in batches to respect rate limits
  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(page => detectFiguresInPage(page.imageBuffer, page.pageNumber))
    );

    results.push(...batchResults);

    // Rate limit delay between batches (500ms)
    if (i + concurrency < pages.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Parse the Gemini response and extract figure information
 */
function parseFigureDetectionResponse(text: string): DetectedFigure[] {
  try {
    // Remove markdown code blocks if present
    let jsonStr = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Try to find JSON array in the response
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      console.warn('Figure detection response is not an array');
      return [];
    }

    return parsed.map(item => ({
      figureNumber: String(item.figureNumber || '').trim(),
      caption: String(item.caption || '').trim(),
      boundingBox: {
        x: clamp(Number(item.boundingBox?.x) || 0, 0, 1),
        y: clamp(Number(item.boundingBox?.y) || 0, 0, 1),
        width: clamp(Number(item.boundingBox?.width) || 0.1, 0.05, 1),
        height: clamp(Number(item.boundingBox?.height) || 0.1, 0.05, 1),
      },
      type: validateFigureType(item.type),
    }));
  } catch (error) {
    console.warn('Failed to parse figure detection response:', error);
    return [];
  }
}

/**
 * Validate that a detected figure has required fields
 */
function isValidFigure(figure: DetectedFigure): boolean {
  return (
    figure.figureNumber.length > 0 &&
    figure.boundingBox.width > 0 &&
    figure.boundingBox.height > 0
  );
}

/**
 * Validate figure type
 */
function validateFigureType(
  type: unknown
): 'chart' | 'diagram' | 'image' | 'table' | 'other' {
  const validTypes = ['chart', 'diagram', 'image', 'table', 'other'];
  if (typeof type === 'string' && validTypes.includes(type.toLowerCase())) {
    return type.toLowerCase() as DetectedFigure['type'];
  }
  return 'other';
}

/**
 * Clamp a number between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get normalized figure number for matching with text references
 */
export function getNormalizedFigureNumber(detected: DetectedFigure): string {
  return normalizeFigureReference(detected.figureNumber);
}
