/**
 * QASPER Dataset Type Definitions
 *
 * QASPER (Question Answering on Scientific Papers) is a QA dataset
 * for NLP/ML domain academic papers.
 *
 * Dataset source: https://huggingface.co/datasets/allenai/qasper
 */

/**
 * The actual answer content from the QASPER dataset
 */
export interface QasperAnswerContent {
  /** Whether the question is unanswerable from the paper */
  unanswerable: boolean;
  /** Extracted spans directly from the paper (verbatim quotes) */
  extractive_spans: string[];
  /** Human-written summary answer */
  free_form_answer: string;
  /** For yes/no questions: true = yes, false = no, null = not a yes/no question */
  yes_no: boolean | null;
  /** Evidence text passages that support the answer */
  evidence: string[];
  /** Highlighted evidence text */
  highlighted_evidence?: string[];
}

/**
 * A single answer annotation from the QASPER dataset
 * Note: QASPER wraps the answer content in an "answer" field
 */
export interface QasperAnswer {
  /** The actual answer content */
  answer: QasperAnswerContent;
  /** Annotation ID */
  annotation_id: string;
  /** Worker ID */
  worker_id: string;
}

/**
 * A question-answer pair from the QASPER dataset
 */
export interface QasperQA {
  question: string;
  question_id: string;
  /** Multiple annotator answers for the same question */
  answers: QasperAnswer[];
}

/**
 * Full text section from a QASPER paper
 */
export interface QasperSection {
  section_name: string;
  paragraphs: string[];
}

/**
 * A paper entry from the QASPER dataset
 */
export interface QasperPaper {
  /** ArXiv paper ID (e.g., "1909.00694") */
  id: string;
  title: string;
  abstract: string;
  full_text: QasperSection[];
  qas: QasperQA[];
}

/**
 * Answer type classification for evaluation
 */
export type AnswerType =
  | 'extractive'
  | 'abstractive'
  | 'yes_no'
  | 'unanswerable';

/**
 * Classify the answer type based on QASPER answer fields
 */
export function classifyAnswerType(answer: QasperAnswer): AnswerType {
  const content = answer.answer;
  if (content.unanswerable) {
    return 'unanswerable';
  }
  if (content.yes_no !== null) {
    return 'yes_no';
  }
  if (content.extractive_spans.length > 0) {
    return 'extractive';
  }
  return 'abstractive';
}

/**
 * Get reference answers for evaluation
 * Returns extractive spans if available, otherwise free-form answer
 */
export function getReferenceAnswers(answer: QasperAnswer): string[] {
  const content = answer.answer;
  if (content.unanswerable) {
    return ['unanswerable'];
  }
  if (content.yes_no !== null) {
    return [content.yes_no ? 'yes' : 'no'];
  }
  if (content.extractive_spans.length > 0) {
    return content.extractive_spans;
  }
  if (content.free_form_answer) {
    return [content.free_form_answer];
  }
  return [];
}

/**
 * Evaluation metrics for a single question
 */
export interface QuestionMetrics {
  f1: number;
  exactMatch: number;
}

/**
 * Single question evaluation result
 */
export interface QuestionEvalResult {
  paperId: string;
  questionId: string;
  question: string;
  answerType: AnswerType;
  predicted: string;
  references: string[];
  metrics: QuestionMetrics;
  /** Time taken for RAG query in ms */
  latencyMs: number;
  /** Error message if query failed */
  error?: string;
}

/**
 * Aggregated metrics by answer type
 */
export interface TypeMetrics {
  count: number;
  f1: number;
  exactMatch: number;
}

/**
 * Evaluation summary
 */
export interface EvaluationSummary {
  overall: {
    f1: number;
    exactMatch: number;
    totalQuestions: number;
  };
  byType: {
    extractive: TypeMetrics;
    abstractive: TypeMetrics;
    yes_no: TypeMetrics;
    unanswerable: TypeMetrics;
  };
}

/**
 * Checkpoint data for resuming evaluation
 */
export interface EvaluationCheckpoint {
  collectionId: string;
  timestamp: string;
  lastPaperId: string;
  lastQuestionId: string;
  completedQuestions: number;
  results: QuestionEvalResult[];
}

/**
 * Final evaluation result
 */
export interface EvaluationResult {
  metadata: {
    timestamp: string;
    model: string;
    totalPapers: number;
    totalQuestions: number;
    runtimeMs: number;
    collectionId: string;
  };
  summary: EvaluationSummary;
  details: QuestionEvalResult[];
  errors: Array<{
    paperId: string;
    questionId?: string;
    error: string;
  }>;
}

/**
 * Paper ingestion result
 */
export interface IngestionResult {
  queued: number;
  failed: string[];
  paperIdMap: Map<string, string>; // arxivId -> dbPaperId
}

/**
 * Indexing status
 */
export interface IndexingStatus {
  completed: string[];
  failed: string[];
  pending: string[];
}
