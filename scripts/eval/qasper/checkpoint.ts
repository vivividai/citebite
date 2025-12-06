/**
 * Checkpoint Management
 *
 * Saves and loads evaluation progress for resume support.
 * Checkpoints are saved every N questions and on interruption.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { EvaluationCheckpoint, QuestionEvalResult } from './types';

const CHECKPOINT_DIR = path.join(process.cwd(), 'eval-results');
const CHECKPOINT_SUFFIX = '-checkpoint.json';

/**
 * Get checkpoint file path for a collection
 */
export function getCheckpointPath(collectionId: string): string {
  return path.join(CHECKPOINT_DIR, `${collectionId}${CHECKPOINT_SUFFIX}`);
}

/**
 * Ensure the checkpoint directory exists
 */
function ensureCheckpointDir(): void {
  if (!existsSync(CHECKPOINT_DIR)) {
    mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
}

/**
 * Save evaluation checkpoint
 *
 * @param collectionId - Collection being evaluated
 * @param lastPaperId - Last processed paper ID
 * @param lastQuestionId - Last processed question ID
 * @param results - Results so far
 */
export function saveCheckpoint(
  collectionId: string,
  lastPaperId: string,
  lastQuestionId: string,
  results: QuestionEvalResult[]
): void {
  ensureCheckpointDir();

  const checkpoint: EvaluationCheckpoint = {
    collectionId,
    timestamp: new Date().toISOString(),
    lastPaperId,
    lastQuestionId,
    completedQuestions: results.length,
    results,
  };

  const checkpointPath = getCheckpointPath(collectionId);
  writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

  console.log(`\nCheckpoint saved: ${results.length} questions completed`);
}

/**
 * Load existing checkpoint if available
 *
 * @param collectionId - Collection to load checkpoint for
 * @returns Checkpoint data or null if not found
 */
export function loadCheckpoint(
  collectionId: string
): EvaluationCheckpoint | null {
  const checkpointPath = getCheckpointPath(collectionId);

  if (!existsSync(checkpointPath)) {
    return null;
  }

  try {
    const content = readFileSync(checkpointPath, 'utf-8');
    const checkpoint = JSON.parse(content) as EvaluationCheckpoint;

    // Validate checkpoint
    if (checkpoint.collectionId !== collectionId) {
      console.warn('Checkpoint collection ID mismatch, ignoring');
      return null;
    }

    return checkpoint;
  } catch (error) {
    console.warn('Failed to load checkpoint:', error);
    return null;
  }
}

/**
 * Delete checkpoint file after successful completion
 */
export function deleteCheckpoint(collectionId: string): void {
  const checkpointPath = getCheckpointPath(collectionId);

  if (existsSync(checkpointPath)) {
    const fs = require('fs');
    fs.unlinkSync(checkpointPath);
    console.log('Checkpoint deleted after successful completion');
  }
}

/**
 * Check if a question should be skipped (already in checkpoint)
 */
export function shouldSkipQuestion(
  checkpoint: EvaluationCheckpoint | null,
  paperId: string,
  questionId: string
): boolean {
  if (!checkpoint) return false;

  // Check if this question is in the completed results
  return checkpoint.results.some(
    result => result.paperId === paperId && result.questionId === questionId
  );
}

/**
 * Get resumption info for display
 */
export function getResumeInfo(
  checkpoint: EvaluationCheckpoint | null
): string | null {
  if (!checkpoint) return null;

  const timestamp = new Date(checkpoint.timestamp).toLocaleString();
  return `Found checkpoint from ${timestamp} with ${checkpoint.completedQuestions} completed questions`;
}
