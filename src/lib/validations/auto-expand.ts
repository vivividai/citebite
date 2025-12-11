import { z } from 'zod';

/**
 * Validation schema for auto-expand preview request
 */
export const autoExpandPreviewSchema = z.object({
  degree: z.number().int().min(1).max(3),
  type: z.enum(['references', 'citations', 'both']),
  influentialOnly: z.boolean().default(false),
  maxPapersPerNode: z.number().int().min(10).max(100).default(50),
});

export type AutoExpandPreviewInput = z.infer<typeof autoExpandPreviewSchema>;
