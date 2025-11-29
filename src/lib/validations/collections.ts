import { z } from 'zod';

/**
 * Validation schema for collection creation
 */
export const createCollectionSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Collection name is required')
      .max(255, 'Collection name must be less than 255 characters')
      .trim(),
    keywords: z.string().trim().optional(),

    // AI-Assisted mode fields
    useAiAssistant: z.boolean().default(false),
    naturalLanguageQuery: z.string().trim().optional(),

    // Selected paper IDs from preview (optional - if not provided, all papers are included)
    selectedPaperIds: z.array(z.string()).optional(),

    filters: z
      .object({
        yearFrom: z.preprocess(val => {
          if (val === '' || val === undefined || val === null) return undefined;
          const num = Number(val);
          return isNaN(num) ? undefined : num;
        }, z.number().int().min(1900, 'Year must be 1900 or later').optional()),
        yearTo: z.preprocess(val => {
          if (val === '' || val === undefined || val === null) return undefined;
          const num = Number(val);
          return isNaN(num) ? undefined : num;
        }, z.number().int().max(new Date().getFullYear(), 'Year cannot be in the future').optional()),
        minCitations: z.preprocess(val => {
          if (val === '' || val === undefined || val === null) return undefined;
          const num = Number(val);
          return isNaN(num) ? undefined : num;
        }, z.number().int().min(0, 'Minimum citations must be non-negative').optional()),
        openAccessOnly: z.boolean().optional(),
      })
      .optional()
      .refine(
        data => {
          if (!data) return true;
          if (data.yearFrom && data.yearTo) {
            return data.yearFrom <= data.yearTo;
          }
          return true;
        },
        {
          message: 'yearFrom must be less than or equal to yearTo',
        }
      ),
  })
  .refine(
    data => {
      // Either keywords or naturalLanguageQuery must be provided
      if (data.useAiAssistant) {
        return (
          !!data.naturalLanguageQuery && data.naturalLanguageQuery.length > 0
        );
      } else {
        return !!data.keywords && data.keywords.length > 0;
      }
    },
    {
      message: 'Either keywords or naturalLanguageQuery is required',
    }
  );

/**
 * TypeScript type inferred from the schema (output type)
 */
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

/**
 * Input type for forms (allows optional useAiAssistant)
 */
export type CreateCollectionFormInput = z.input<typeof createCollectionSchema>;

/**
 * Alias for backwards compatibility - use input type for forms
 */
export type CreateCollectionSchema = CreateCollectionFormInput;
