import { z } from 'zod';

/**
 * Validation schema for expand preview request
 */
export const expandPreviewSchema = z.object({
  paperId: z.string().min(1, 'Paper ID is required'),
  type: z.enum(['references', 'citations', 'both']),
  influentialOnly: z.boolean().optional().default(false),
  maxPapers: z.number().min(10).max(500).optional().default(100),
});

/**
 * Validation schema for expand collection request
 */
export const expandCollectionSchema = z.object({
  selectedPaperIds: z
    .array(z.string())
    .min(1, 'At least one paper must be selected'),
  sourcePaperId: z.string().min(1, 'Source paper ID is required'),
  // Per-paper relationship types (paperId -> 'reference' | 'citation')
  sourceTypes: z.record(z.string(), z.enum(['reference', 'citation'])),
  similarities: z.record(z.string(), z.number()).optional(),
});

export type ExpandPreviewInput = z.infer<typeof expandPreviewSchema>;
export type ExpandCollectionInput = z.infer<typeof expandCollectionSchema>;
