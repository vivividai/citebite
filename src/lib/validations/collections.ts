import { z } from 'zod';

/**
 * Helper to convert NaN to undefined for optional number fields
 */
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(val => (Number.isNaN(val) ? undefined : val), schema.optional());

/**
 * Validation schema for collection creation
 */
export const createCollectionSchema = z.object({
  name: z
    .string()
    .min(1, 'Collection name is required')
    .max(255, 'Collection name must be less than 255 characters')
    .trim(),
  keywords: z.string().min(1, 'Search keywords are required').trim(),
  filters: z
    .object({
      yearFrom: optionalNumber(
        z.number().int().min(1900, 'Year must be 1900 or later')
      ),
      yearTo: optionalNumber(
        z
          .number()
          .int()
          .max(new Date().getFullYear(), 'Year cannot be in the future')
      ),
      minCitations: optionalNumber(
        z.number().int().min(0, 'Minimum citations must be non-negative')
      ),
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
});

/**
 * TypeScript type inferred from the schema
 */
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

/**
 * Alias for backwards compatibility
 */
export type CreateCollectionSchema = CreateCollectionInput;
