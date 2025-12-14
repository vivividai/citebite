/**
 * Figure Types
 *
 * Shared type definitions for figure detection and processing.
 */

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

/**
 * Figure type classification
 */
export type FigureType = 'chart' | 'diagram' | 'image' | 'table' | 'other';

/**
 * Validate figure type
 */
export function validateFigureType(type: unknown): FigureType {
  const validTypes: FigureType[] = [
    'chart',
    'diagram',
    'image',
    'table',
    'other',
  ];
  if (
    typeof type === 'string' &&
    validTypes.includes(type.toLowerCase() as FigureType)
  ) {
    return type.toLowerCase() as FigureType;
  }
  return 'other';
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
