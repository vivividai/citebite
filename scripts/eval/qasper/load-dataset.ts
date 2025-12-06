/**
 * QASPER Dataset Loader
 *
 * Parses JSONL files from the QASPER dataset.
 * Expected file: data/qasper/qasper-dev-v0.3.jsonl
 */

import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { QasperPaper } from './types';
import path from 'path';

const DEFAULT_DATASET_PATH = path.join(
  process.cwd(),
  'data',
  'qasper',
  'qasper-dev-v0.3.jsonl'
);

/**
 * Load QASPER dataset from JSONL file
 *
 * @param datasetPath - Path to the JSONL file (defaults to data/qasper/qasper-dev-v0.3.jsonl)
 * @param limit - Optional limit on number of papers to load
 * @returns Array of QASPER papers
 */
export async function loadQasperDataset(
  datasetPath: string = DEFAULT_DATASET_PATH,
  limit?: number
): Promise<QasperPaper[]> {
  if (!existsSync(datasetPath)) {
    throw new Error(
      `QASPER dataset not found at: ${datasetPath}\n` +
        'Please download from: https://huggingface.co/datasets/allenai/qasper\n' +
        'And place qasper-dev-v0.3.jsonl in data/qasper/'
    );
  }

  const papers: QasperPaper[] = [];

  const fileStream = createReadStream(datasetPath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (limit && papers.length >= limit) {
      break;
    }

    if (!line.trim()) {
      continue;
    }

    try {
      const data = JSON.parse(line);

      // QASPER JSONL format has paper_id as key and content as value
      // Structure: {"paper_id": {...paper_content...}}
      const entries = Object.entries(data);

      for (const [paperId, content] of entries) {
        if (limit && papers.length >= limit) {
          break;
        }

        const paper = content as Omit<QasperPaper, 'id'>;
        papers.push({
          id: paperId,
          ...paper,
        });
      }
    } catch (parseError) {
      console.warn(`Failed to parse line: ${(parseError as Error).message}`);
    }
  }

  return papers;
}

/**
 * Get total QA pair count from papers
 */
export function getTotalQACount(papers: QasperPaper[]): number {
  return papers.reduce((sum, paper) => sum + paper.qas.length, 0);
}

/**
 * Get statistics about the loaded dataset
 */
export function getDatasetStats(papers: QasperPaper[]) {
  const totalQAs = getTotalQACount(papers);
  const questionsPerPaper = papers.length > 0 ? totalQAs / papers.length : 0;

  // Count answer types
  let extractive = 0;
  let abstractive = 0;
  let yesNo = 0;
  let unanswerable = 0;

  for (const paper of papers) {
    for (const qa of paper.qas) {
      // Use first annotator's answer for classification
      const answerWrapper = qa.answers[0];
      if (!answerWrapper || !answerWrapper.answer) continue;

      const answer = answerWrapper.answer;

      if (answer.unanswerable) {
        unanswerable++;
      } else if (answer.yes_no !== null) {
        yesNo++;
      } else if (answer.extractive_spans.length > 0) {
        extractive++;
      } else {
        abstractive++;
      }
    }
  }

  return {
    totalPapers: papers.length,
    totalQuestions: totalQAs,
    avgQuestionsPerPaper: questionsPerPaper.toFixed(1),
    answerTypes: {
      extractive,
      abstractive,
      yesNo,
      unanswerable,
    },
  };
}

/**
 * Filter papers that have QA pairs
 */
export function filterPapersWithQAs(papers: QasperPaper[]): QasperPaper[] {
  return papers.filter(paper => paper.qas.length > 0);
}
