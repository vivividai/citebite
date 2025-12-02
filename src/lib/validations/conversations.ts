import { z } from 'zod';

/**
 * Validation schema for creating a new conversation
 */
export const createConversationSchema = z.object({
  collectionId: z.string().uuid('Collection ID must be a valid UUID'),
  title: z
    .string()
    .max(255, 'Title must be less than 255 characters')
    .trim()
    .optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

/**
 * Available Gemini model options
 */
export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro-preview-05-06',
  'gemini-3-pro-preview',
] as const;

export type GeminiModel = (typeof GEMINI_MODELS)[number];

/**
 * Validation schema for sending a message in a conversation
 */
export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message must be less than 10,000 characters')
    .trim(),
  model: z.enum(GEMINI_MODELS).optional().default('gemini-2.5-flash'),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * Validation schema for getting messages from a conversation
 */
export const getMessagesSchema = z.object({
  limit: z
    .string()
    .nullable()
    .optional()
    .transform(val => (val ? parseInt(val, 10) : 50))
    .pipe(
      z
        .number()
        .int('Limit must be an integer')
        .min(1, 'Limit must be at least 1')
        .max(100, 'Limit cannot exceed 100')
    ),
  before: z
    .string()
    .datetime('Before must be a valid ISO datetime string')
    .optional()
    .nullable()
    .transform(val => val ?? undefined),
  after: z
    .string()
    .datetime('After must be a valid ISO datetime string')
    .optional()
    .nullable()
    .transform(val => val ?? undefined),
});

export type GetMessagesInput = z.infer<typeof getMessagesSchema>;
