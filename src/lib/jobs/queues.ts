/**
 * BullMQ Queue Definitions
 * Manages background job queues for PDF processing
 */

import { Queue } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';

// Job data type definitions
export interface PdfDownloadJobData {
  collectionId: string;
  paperId: string;
  pdfUrl: string;
}

export interface PdfIndexJobData {
  collectionId: string;
  paperId: string;
  storageKey: string; // Key in Supabase Storage
}

export interface BulkUploadCleanupJobData {
  sessionId?: string;
  userId?: string;
}

export interface FigureAnalysisJobData {
  collectionId: string;
  paperId: string;
  storageKey: string;
}

// Queue instances (singleton pattern)
let pdfDownloadQueue: Queue<PdfDownloadJobData> | null = null;
let pdfIndexQueue: Queue<PdfIndexJobData> | null = null;
let bulkUploadCleanupQueue: Queue<BulkUploadCleanupJobData> | null = null;
let figureAnalysisQueue: Queue<FigureAnalysisJobData> | null = null;

/**
 * Get or create PDF Download Queue
 */
export function getPdfDownloadQueue(): Queue<PdfDownloadJobData> | null {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not configured. Background jobs are disabled.');
    return null;
  }

  if (pdfDownloadQueue) {
    return pdfDownloadQueue;
  }

  const connection = getRedisClient();
  if (!connection) {
    return null;
  }

  pdfDownloadQueue = new Queue<PdfDownloadJobData>('pdf-download', {
    connection,
    defaultJobOptions: {
      attempts: 3, // Retry up to 3 times
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 second delay
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep max 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  });

  return pdfDownloadQueue;
}

/**
 * Get or create PDF Indexing Queue
 */
export function getPdfIndexQueue(): Queue<PdfIndexJobData> | null {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not configured. Background jobs are disabled.');
    return null;
  }

  if (pdfIndexQueue) {
    return pdfIndexQueue;
  }

  const connection = getRedisClient();
  if (!connection) {
    return null;
  }

  pdfIndexQueue = new Queue<PdfIndexJobData>('pdf-indexing', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 second delay (API rate limits)
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  });

  return pdfIndexQueue;
}

/**
 * Get or create Bulk Upload Cleanup Queue
 */
export function getBulkUploadCleanupQueue(): Queue<BulkUploadCleanupJobData> | null {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not configured. Background jobs are disabled.');
    return null;
  }

  if (bulkUploadCleanupQueue) {
    return bulkUploadCleanupQueue;
  }

  const connection = getRedisClient();
  if (!connection) {
    return null;
  }

  bulkUploadCleanupQueue = new Queue<BulkUploadCleanupJobData>(
    'bulk-upload-cleanup',
    {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 100,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    }
  );

  return bulkUploadCleanupQueue;
}

/**
 * Get or create Figure Analysis Queue
 */
export function getFigureAnalysisQueue(): Queue<FigureAnalysisJobData> | null {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not configured. Background jobs are disabled.');
    return null;
  }

  if (figureAnalysisQueue) {
    return figureAnalysisQueue;
  }

  const connection = getRedisClient();
  if (!connection) {
    return null;
  }

  figureAnalysisQueue = new Queue<FigureAnalysisJobData>('figure-analysis', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 second delay (Vision API rate limits)
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  });

  return figureAnalysisQueue;
}

/**
 * Close all queue connections (use on app shutdown)
 */
export async function closeQueues(): Promise<void> {
  const queues = [
    pdfDownloadQueue,
    pdfIndexQueue,
    bulkUploadCleanupQueue,
    figureAnalysisQueue,
  ];

  for (const queue of queues) {
    if (queue) {
      await queue.close();
    }
  }

  pdfDownloadQueue = null;
  pdfIndexQueue = null;
  bulkUploadCleanupQueue = null;
  figureAnalysisQueue = null;
}

/**
 * Helper function to add a PDF download job
 */
export async function queuePdfDownload(
  data: PdfDownloadJobData
): Promise<string | null> {
  const queue = getPdfDownloadQueue();
  if (!queue) {
    console.error('PDF download queue not available');
    return null;
  }

  try {
    const job = await queue.add('download-pdf', data);
    return job.id ?? null;
  } catch (error) {
    console.error('Failed to queue PDF download job:', error);
    return null;
  }
}

/**
 * Helper function to add a PDF indexing job
 */
export async function queuePdfIndexing(
  data: PdfIndexJobData
): Promise<string | null> {
  const queue = getPdfIndexQueue();
  if (!queue) {
    console.error('PDF indexing queue not available');
    return null;
  }

  try {
    const job = await queue.add('index-pdf', data);
    return job.id ?? null;
  } catch (error) {
    console.error('Failed to queue PDF indexing job:', error);
    return null;
  }
}

/**
 * Helper function to add a bulk upload cleanup job
 * Can clean a specific session or all expired sessions (if no params)
 */
export async function queueBulkUploadCleanup(
  data: BulkUploadCleanupJobData = {}
): Promise<string | null> {
  const queue = getBulkUploadCleanupQueue();
  if (!queue) {
    console.error('Bulk upload cleanup queue not available');
    return null;
  }

  try {
    const job = await queue.add('cleanup-bulk-upload', data);
    return job.id ?? null;
  } catch (error) {
    console.error('Failed to queue bulk upload cleanup job:', error);
    return null;
  }
}

/**
 * Schedule recurring bulk upload cleanup job
 * Runs every hour to clean up expired sessions
 */
export async function scheduleRecurringCleanup(): Promise<void> {
  const queue = getBulkUploadCleanupQueue();
  if (!queue) {
    console.warn('Cannot schedule recurring cleanup - queue not available');
    return;
  }

  try {
    // Add a repeatable job that runs every hour
    await queue.add(
      'scheduled-cleanup',
      {},
      {
        repeat: {
          pattern: '0 * * * *', // Every hour at minute 0
        },
        jobId: 'scheduled-bulk-upload-cleanup', // Unique ID to prevent duplicates
      }
    );
    console.log('Scheduled recurring bulk upload cleanup job (every hour)');
  } catch (error) {
    console.error('Failed to schedule recurring cleanup:', error);
  }
}

/**
 * Helper function to add a figure analysis job
 */
export async function queueFigureAnalysis(
  data: FigureAnalysisJobData
): Promise<string | null> {
  const queue = getFigureAnalysisQueue();
  if (!queue) {
    console.error('Figure analysis queue not available');
    return null;
  }

  try {
    const job = await queue.add('analyze-figures', data);
    return job.id ?? null;
  } catch (error) {
    console.error('Failed to queue figure analysis job:', error);
    return null;
  }
}
