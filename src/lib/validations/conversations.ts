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
