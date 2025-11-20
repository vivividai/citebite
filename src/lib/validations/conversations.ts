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
 * Validation schema for sending a message in a conversation
 */
export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message must be less than 10,000 characters')
    .trim(),
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
    .nullable(),
  after: z
    .string()
    .datetime('After must be a valid ISO datetime string')
    .optional()
    .nullable(),
});

export type GetMessagesInput = z.infer<typeof getMessagesSchema>;
