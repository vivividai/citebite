/**
 * Main Evaluation Runner
 *
 * Runs RAG queries for each QA pair and calculates metrics.
 */

import { queryRAG } from '@/lib/rag';
import {
  QasperPaper,
  QuestionEvalResult,
  classifyAnswerType,
  getReferenceAnswers,
} from './types';
import { evaluateByType, stripCitations } from './metrics';
import {
  saveCheckpoint,
  loadCheckpoint,
  shouldSkipQuestion,
  getResumeInfo,
} from './checkpoint';

export interface EvaluationOptions {
  /** Resume from checkpoint */
  resume?: boolean;
  /** Limit number of questions to evaluate */
  limit?: number;
  /** Checkpoint interval (save every N questions) */
  checkpointInterval?: number;
  /** Delay between requests in ms (rate limiting) */
  requestDelayMs?: number;
  /** Progress callback */
  onProgress?: (
    current: number,
    total: number,
    lastResult?: QuestionEvalResult
  ) => void;
}

/**
 * Run evaluation on QASPER dataset
 *
 * Process:
 * 1. Load checkpoint if resuming
 * 2. For each paper's QA pairs:
 *    a. Query RAG with the question
 *    b. Strip citation markers from response
 *    c. Calculate F1/EM metrics
 *    d. Save checkpoint periodically
 * 3. Return all results
 *
 * @param collectionId - Collection to query
 * @param papers - QASPER papers with QA pairs
 * @param options - Evaluation options
 * @returns Array of evaluation results
 */
export async function runEvaluation(
  collectionId: string,
  papers: QasperPaper[],
  options: EvaluationOptions = {}
): Promise<QuestionEvalResult[]> {
  const {
    resume = false,
    limit,
    checkpointInterval = 50,
    requestDelayMs = 100,
    onProgress,
  } = options;

  // Load checkpoint if resuming
  const checkpoint = resume ? loadCheckpoint(collectionId) : null;
  const results: QuestionEvalResult[] = checkpoint
    ? [...checkpoint.results]
    : [];

  if (checkpoint) {
    const info = getResumeInfo(checkpoint);
    console.log(info);
  }

  // Count total questions
  let totalQuestions = 0;
  for (const paper of papers) {
    totalQuestions += paper.qas.length;
  }

  if (limit && limit < totalQuestions) {
    totalQuestions = limit;
  }

  console.log(`\nStarting evaluation: ${totalQuestions} questions`);
  console.log(`Checkpoint interval: every ${checkpointInterval} questions`);
  console.log(`Request delay: ${requestDelayMs}ms\n`);

  let processedCount = results.length;
  let questionCount = 0;

  for (const paper of papers) {
    const arxivId = paper.id;
    const paperId = `arxiv:${arxivId}`;

    for (const qa of paper.qas) {
      // Check limit
      if (limit && questionCount >= limit) {
        break;
      }
      questionCount++;

      // Skip if already in checkpoint
      if (shouldSkipQuestion(checkpoint, paperId, qa.question_id)) {
        continue;
      }

      // Get first annotator's answer for evaluation
      const answer = qa.answers[0];
      if (!answer) {
        console.warn(`No answer for question ${qa.question_id}, skipping`);
        continue;
      }

      const answerType = classifyAnswerType(answer);
      const references = getReferenceAnswers(answer);

      const startTime = Date.now();
      let predicted = '';
      let error: string | undefined;

      try {
        // Query RAG
        const response = await queryRAG(collectionId, qa.question);
        predicted = stripCitations(response.answer);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        console.error(`\nError for question ${qa.question_id}:`, error);
      }

      const latencyMs = Date.now() - startTime;

      // Calculate metrics
      const metrics = error
        ? { f1: 0, exactMatch: 0 }
        : evaluateByType(
            predicted,
            references,
            answerType,
            answer.answer.yes_no
          );

      const result: QuestionEvalResult = {
        paperId,
        questionId: qa.question_id,
        question: qa.question,
        answerType,
        predicted,
        references,
        metrics,
        latencyMs,
        error,
      };

      results.push(result);
      processedCount++;

      // Progress callback
      onProgress?.(processedCount, totalQuestions, result);

      // Save checkpoint periodically
      if (processedCount % checkpointInterval === 0) {
        saveCheckpoint(collectionId, paperId, qa.question_id, results);
      }

      // Rate limiting delay
      if (requestDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, requestDelayMs));
      }
    }

    // Check limit at paper level too
    if (limit && questionCount >= limit) {
      break;
    }
  }

  // Save final checkpoint
  if (results.length > 0) {
    const lastResult = results[results.length - 1];
    saveCheckpoint(
      collectionId,
      lastResult.paperId,
      lastResult.questionId,
      results
    );
  }

  return results;
}

/**
 * Format progress display
 */
export function formatProgress(
  current: number,
  total: number,
  result?: QuestionEvalResult
): string {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const bar = formatProgressBar(current, total);

  let line = `${bar} ${current}/${total} (${percentage}%)`;

  if (result) {
    const f1 = result.metrics.f1.toFixed(3);
    const type = result.answerType.substring(0, 3);
    line += ` | F1: ${f1} | Type: ${type}`;
  }

  return line;
}

/**
 * Format progress bar
 */
function formatProgressBar(current: number, total: number): string {
  const width = 20;
  const progress = Math.min(current / total, 1);
  const filled = Math.round(progress * width);
  const empty = width - filled;

  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}
