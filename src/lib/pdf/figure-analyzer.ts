/**
 * Figure Analyzer
 *
 * Analyzes figure images using Gemini Vision AI.
 * Incorporates related text context for more accurate descriptions.
 */

import { getGeminiClient, withGeminiErrorHandling } from '@/lib/gemini/client';
import { CroppedFigure } from './figure-extractor';
import {
  findChunksThatReferenceFigure,
  buildFigureContext,
  RelatedTextChunk,
} from './figure-context';

export interface FigureAnalysis {
  /** Original figure number */
  figureNumber: string;
  /** Normalized figure number (for matching) */
  normalizedFigureNumber: string;
  /** Caption from the paper */
  caption: string;
  /** AI-generated detailed description */
  description: string;
  /** Page number */
  pageNumber: number;
  /** Figure image buffer */
  imageBuffer: Buffer;
  /** Figure type */
  type: 'chart' | 'diagram' | 'image' | 'table' | 'other';
  /** IDs of text chunks that mention this figure */
  mentionedInChunkIds: string[];
}

const FIGURE_ANALYSIS_PROMPT_WITH_CONTEXT = `You are analyzing a figure from an academic research paper.

Figure Information:
- Figure Number: {figureNumber}
- Caption: {caption}

Related text from the paper that discusses this figure:
---
{relatedTextContext}
---

Based on BOTH the image AND the text context above, provide a comprehensive description of this figure.

Your description should include:
1. What type of visualization this is (bar chart, line graph, flowchart, architecture diagram, etc.)
2. Key elements and their relationships
3. Main findings or insights shown (use specific numbers/data if mentioned in the text)
4. Any trends, patterns, or notable data points
5. Labels, axes, legends if applicable
6. The significance of this figure in the context of the paper

Write 2-4 paragraphs. Be precise and technical. Focus on information that would be relevant for answering research questions about this paper.

IMPORTANT: Incorporate insights from the related text to provide a more complete understanding. The text often explains what the figure demonstrates or why it's significant.

Do NOT start with "This figure shows..." - instead, directly describe the content.`;

const FIGURE_ANALYSIS_PROMPT_NO_CONTEXT = `You are analyzing a figure from an academic research paper.

Figure Information:
- Figure Number: {figureNumber}
- Caption: {caption}

Provide a detailed description of this figure that would help a researcher understand its content without seeing the image.

Your description should include:
1. What type of visualization this is (bar chart, line graph, flowchart, architecture diagram, etc.)
2. Key elements and their relationships
3. Main findings or insights shown
4. Any trends, patterns, or notable data points
5. Labels, axes, legends if applicable

Write 2-4 paragraphs. Be precise and technical. Focus on the information that would be relevant for answering research questions about this paper.

Do NOT start with "This figure shows..." - instead, directly describe the content.`;

/**
 * Analyze a figure with Gemini Vision AI
 *
 * @param croppedFigure - Cropped figure image and metadata
 * @param paperId - Paper ID (for finding related text)
 * @param collectionId - Collection ID
 * @returns Figure analysis with description
 *
 * @example
 * ```typescript
 * const analysis = await analyzeFigure(croppedFigure, 'paper123', 'collection456');
 * console.log(analysis.description);
 * ```
 */
export async function analyzeFigure(
  croppedFigure: CroppedFigure,
  paperId: string,
  collectionId: string
): Promise<FigureAnalysis> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    // 1. Find related text chunks
    const relatedChunks = await findChunksThatReferenceFigure(
      paperId,
      collectionId,
      croppedFigure.normalizedFigureNumber
    );

    // 2. Build prompt with or without context
    const prompt = buildAnalysisPrompt(
      croppedFigure.figureNumber,
      croppedFigure.caption,
      relatedChunks
    );

    // 3. Analyze with Vision AI
    const response = await client.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: croppedFigure.imageBuffer.toString('base64'),
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        temperature: 0.3, // Moderate temperature for descriptive text
        maxOutputTokens: 2048,
      },
    });

    const description = response.text || '';

    return {
      figureNumber: croppedFigure.figureNumber,
      normalizedFigureNumber: croppedFigure.normalizedFigureNumber,
      caption: croppedFigure.caption,
      description: description.trim(),
      pageNumber: croppedFigure.pageNumber,
      imageBuffer: croppedFigure.imageBuffer,
      type: croppedFigure.type,
      mentionedInChunkIds: relatedChunks.map(c => c.id),
    };
  });
}

/**
 * Analyze a figure without fetching context from database
 * (for use during initial indexing when text chunks already known)
 *
 * @param croppedFigure - Cropped figure
 * @param relatedChunks - Pre-fetched related chunks
 * @returns Figure analysis
 */
export async function analyzeFigureWithProvidedContext(
  croppedFigure: CroppedFigure,
  relatedChunks: RelatedTextChunk[]
): Promise<FigureAnalysis> {
  return withGeminiErrorHandling(async () => {
    const client = getGeminiClient();

    const prompt = buildAnalysisPrompt(
      croppedFigure.figureNumber,
      croppedFigure.caption,
      relatedChunks
    );

    const response = await client.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: croppedFigure.imageBuffer.toString('base64'),
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    return {
      figureNumber: croppedFigure.figureNumber,
      normalizedFigureNumber: croppedFigure.normalizedFigureNumber,
      caption: croppedFigure.caption,
      description: (response.text || '').trim(),
      pageNumber: croppedFigure.pageNumber,
      imageBuffer: croppedFigure.imageBuffer,
      type: croppedFigure.type,
      mentionedInChunkIds: relatedChunks.map(c => c.id),
    };
  });
}

/**
 * Build the analysis prompt
 */
function buildAnalysisPrompt(
  figureNumber: string,
  caption: string,
  relatedChunks: RelatedTextChunk[]
): string {
  if (relatedChunks.length > 0) {
    const contextText = buildFigureContext(relatedChunks);
    return FIGURE_ANALYSIS_PROMPT_WITH_CONTEXT.replace(
      '{figureNumber}',
      figureNumber
    )
      .replace('{caption}', caption || 'No caption available')
      .replace('{relatedTextContext}', contextText);
  }

  return FIGURE_ANALYSIS_PROMPT_NO_CONTEXT.replace(
    '{figureNumber}',
    figureNumber
  ).replace('{caption}', caption || 'No caption available');
}
