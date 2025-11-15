/**
 * Worker Manager
 * Starts and stops all background workers
 */

import {
  startPdfDownloadWorker,
  stopPdfDownloadWorker,
} from './pdfDownloadWorker';
import { startPdfIndexWorker, stopPdfIndexWorker } from './pdfIndexWorker';
import { startInsightWorker, stopInsightWorker } from './insightWorker';

/**
 * Start all workers
 * Call this when your worker process/server starts
 */
export function startAllWorkers(): void {
  console.log('Starting all background workers...');

  startPdfDownloadWorker();
  startPdfIndexWorker();
  startInsightWorker();

  console.log('All background workers started successfully');
}

/**
 * Stop all workers gracefully
 * Call this when shutting down the worker process
 */
export async function stopAllWorkers(): Promise<void> {
  console.log('Stopping all background workers...');

  await Promise.all([
    stopPdfDownloadWorker(),
    stopPdfIndexWorker(),
    stopInsightWorker(),
  ]);

  console.log('All background workers stopped successfully');
}

// Handle graceful shutdown
if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down workers...');
    await stopAllWorkers();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down workers...');
    await stopAllWorkers();
    process.exit(0);
  });
}
