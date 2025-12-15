/**
 * Paper Status Utilities
 *
 * Helper functions to calculate overall paper status from
 * text_vector_status and image_vector_status.
 */

export type VectorStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped';
export type OverallStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Calculate overall paper status from text and image status.
 *
 * Rules:
 * - Both pending → pending
 * - Either processing → processing
 * - Text completed (image can be completed/skipped/failed) → completed
 * - Text failed → failed
 *
 * Note: Image status failures don't affect overall status if text is completed.
 * This is by design - text indexing is the primary requirement for RAG.
 *
 * @param textStatus - text_vector_status value
 * @param imageStatus - image_vector_status value
 * @returns Overall status for display
 */
export function calculateOverallStatus(
  textStatus: string | null,
  imageStatus: string | null
): OverallStatus {
  const text = (textStatus || 'pending') as VectorStatus;
  const image = (imageStatus || 'pending') as VectorStatus;

  // Both pending → pending
  if (text === 'pending' && image === 'pending') {
    return 'pending';
  }

  // Either processing → processing
  if (text === 'processing' || image === 'processing') {
    return 'processing';
  }

  // Text completed (image status irrelevant for overall) → completed
  if (text === 'completed') {
    return 'completed';
  }

  // Text failed → failed
  return 'failed';
}

/**
 * Check if paper is ready for chat (has text chunks indexed)
 *
 * @param textStatus - text_vector_status value
 * @returns true if paper can be used for RAG queries
 */
export function isPaperReadyForChat(textStatus: string | null): boolean {
  return textStatus === 'completed';
}

/**
 * Check if paper is still processing
 *
 * @param textStatus - text_vector_status value
 * @param imageStatus - image_vector_status value
 * @returns true if either text or image is still processing
 */
export function isPaperProcessing(
  textStatus: string | null,
  imageStatus: string | null
): boolean {
  return textStatus === 'processing' || imageStatus === 'processing';
}
