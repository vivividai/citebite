/**
 * Report Generation
 *
 * Formats and outputs evaluation results.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import {
  QuestionEvalResult,
  EvaluationResult,
  EvaluationSummary,
  TypeMetrics,
  AnswerType,
} from './types';

const RESULTS_DIR = path.join(process.cwd(), 'eval-results');

/**
 * Calculate summary metrics from individual results
 */
export function calculateSummary(
  results: QuestionEvalResult[]
): EvaluationSummary {
  // Initialize type metrics
  const typeMetrics: Record<
    AnswerType,
    { count: number; f1Sum: number; emSum: number }
  > = {
    extractive: { count: 0, f1Sum: 0, emSum: 0 },
    abstractive: { count: 0, f1Sum: 0, emSum: 0 },
    yes_no: { count: 0, f1Sum: 0, emSum: 0 },
    unanswerable: { count: 0, f1Sum: 0, emSum: 0 },
  };

  let totalF1 = 0;
  let totalEM = 0;

  for (const result of results) {
    if (result.error) continue;

    const type = result.answerType;
    typeMetrics[type].count++;
    typeMetrics[type].f1Sum += result.metrics.f1;
    typeMetrics[type].emSum += result.metrics.exactMatch;

    totalF1 += result.metrics.f1;
    totalEM += result.metrics.exactMatch;
  }

  const validCount = results.filter(r => !r.error).length;

  // Calculate averages
  const calculateTypeAvg = (data: {
    count: number;
    f1Sum: number;
    emSum: number;
  }): TypeMetrics => ({
    count: data.count,
    f1: data.count > 0 ? data.f1Sum / data.count : 0,
    exactMatch: data.count > 0 ? data.emSum / data.count : 0,
  });

  return {
    overall: {
      f1: validCount > 0 ? totalF1 / validCount : 0,
      exactMatch: validCount > 0 ? totalEM / validCount : 0,
      totalQuestions: results.length,
    },
    byType: {
      extractive: calculateTypeAvg(typeMetrics.extractive),
      abstractive: calculateTypeAvg(typeMetrics.abstractive),
      yes_no: calculateTypeAvg(typeMetrics.yes_no),
      unanswerable: calculateTypeAvg(typeMetrics.unanswerable),
    },
  };
}

/**
 * Format percentage with % sign
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Print console report
 */
export function printConsoleReport(
  summary: EvaluationSummary,
  runtimeMs: number,
  model: string
): void {
  const runtime = formatRuntime(runtimeMs);

  console.log('\n========================================');
  console.log('QASPER RAG Evaluation Results');
  console.log('========================================');
  console.log(`Model: ${model} | Runtime: ${runtime}`);
  console.log('');

  console.log('--- Overall Metrics ---');
  console.log(`F1 Score:      ${summary.overall.f1.toFixed(3)}`);
  console.log(`Exact Match:   ${formatPercent(summary.overall.exactMatch)}`);
  console.log(`Questions:     ${summary.overall.totalQuestions}`);
  console.log('');

  console.log('--- By Answer Type ---');
  console.log('┌──────────────┬───────┬───────┬───────┐');
  console.log('│ Type         │ Count │ F1    │ EM    │');
  console.log('├──────────────┼───────┼───────┼───────┤');

  const types: Array<{ name: string; data: TypeMetrics }> = [
    { name: 'Extractive', data: summary.byType.extractive },
    { name: 'Abstractive', data: summary.byType.abstractive },
    { name: 'Yes/No', data: summary.byType.yes_no },
    { name: 'Unanswerable', data: summary.byType.unanswerable },
  ];

  for (const type of types) {
    const name = type.name.padEnd(12);
    const count = String(type.data.count).padStart(5);
    const f1 = type.data.f1.toFixed(3).padStart(5);
    const em = formatPercent(type.data.exactMatch).padStart(5);
    console.log(`│ ${name} │ ${count} │ ${f1} │ ${em} │`);
  }

  console.log('└──────────────┴───────┴───────┴───────┘');
  console.log('');
}

/**
 * Format runtime in human-readable format
 */
function formatRuntime(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  } else if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  } else {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.round((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Save full evaluation results to JSON file
 */
export function saveResultsJson(
  results: QuestionEvalResult[],
  summary: EvaluationSummary,
  metadata: {
    collectionId: string;
    model: string;
    totalPapers: number;
    runtimeMs: number;
  }
): string {
  // Ensure results directory exists
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `qasper-${timestamp}.json`;
  const filepath = path.join(RESULTS_DIR, filename);

  const errors = results
    .filter(r => r.error)
    .map(r => ({
      paperId: r.paperId,
      questionId: r.questionId,
      error: r.error!,
    }));

  const fullResult: EvaluationResult = {
    metadata: {
      timestamp: new Date().toISOString(),
      model: metadata.model,
      totalPapers: metadata.totalPapers,
      totalQuestions: results.length,
      runtimeMs: metadata.runtimeMs,
      collectionId: metadata.collectionId,
    },
    summary,
    details: results,
    errors,
  };

  writeFileSync(filepath, JSON.stringify(fullResult, null, 2));

  console.log(`Results saved to: ${filepath}`);
  return filepath;
}

/**
 * Generate full report (console + JSON file)
 */
export function generateReport(
  results: QuestionEvalResult[],
  metadata: {
    collectionId: string;
    model: string;
    totalPapers: number;
    runtimeMs: number;
  }
): string {
  const summary = calculateSummary(results);

  // Print to console
  printConsoleReport(summary, metadata.runtimeMs, metadata.model);

  // Save to file
  const filepath = saveResultsJson(results, summary, metadata);

  // Print error summary if any
  const errorCount = results.filter(r => r.error).length;
  if (errorCount > 0) {
    console.log(`\n⚠️  ${errorCount} questions had errors`);
  }

  return filepath;
}
