/**
 * Indexing Wait Monitor
 *
 * Polls the database to track PDF indexing progress
 * and waits until all papers are indexed or failed.
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';
import { IndexingStatus } from './types';

/**
 * Create admin Supabase client for scripts
 */
function createScriptSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey);
}

/**
 * Get current indexing status for a collection
 */
export async function getIndexingStatus(
  collectionId: string
): Promise<IndexingStatus> {
  const supabase = createScriptSupabaseClient();

  const { data, error } = await supabase
    .from('collection_papers')
    .select('paper_id, papers!inner(vector_status)')
    .eq('collection_id', collectionId);

  if (error) {
    throw new Error(`Failed to get indexing status: ${error.message}`);
  }

  const status: IndexingStatus = {
    completed: [],
    failed: [],
    pending: [],
  };

  for (const item of data) {
    const vectorStatus = (item.papers as unknown as { vector_status: string })
      .vector_status;

    switch (vectorStatus) {
      case 'completed':
        status.completed.push(item.paper_id);
        break;
      case 'failed':
        status.failed.push(item.paper_id);
        break;
      default:
        status.pending.push(item.paper_id);
    }
  }

  return status;
}

/**
 * Format progress bar for console output
 */
function formatProgressBar(
  current: number,
  total: number,
  width: number = 20
): string {
  const progress = Math.min(current / total, 1);
  const filled = Math.round(progress * width);
  const empty = width - filled;

  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Format time remaining estimate
 */
function formatETA(startTime: number, current: number, total: number): string {
  if (current === 0) return 'calculating...';

  const elapsed = Date.now() - startTime;
  const rate = current / elapsed;
  const remaining = total - current;
  const etaMs = remaining / rate;

  if (etaMs < 60000) {
    return `${Math.round(etaMs / 1000)}s`;
  } else if (etaMs < 3600000) {
    return `${Math.round(etaMs / 60000)}min`;
  } else {
    return `${(etaMs / 3600000).toFixed(1)}h`;
  }
}

export interface WaitOptions {
  /** Poll interval in milliseconds (default: 5000) */
  pollIntervalMs?: number;
  /** Timeout in milliseconds (default: 3600000 = 1 hour) */
  timeoutMs?: number;
  /** Progress callback */
  onProgress?: (completed: number, total: number, failed: number) => void;
}

/**
 * Wait for all papers in a collection to be indexed
 *
 * Polls the database periodically and displays progress.
 * Returns when all papers are either completed or failed.
 *
 * @param collectionId - Collection to monitor
 * @param options - Wait options
 * @returns Final indexing status
 */
export async function waitForIndexing(
  collectionId: string,
  options: WaitOptions = {}
): Promise<IndexingStatus> {
  const {
    pollIntervalMs = 5000,
    timeoutMs = 3600000, // 1 hour
    onProgress,
  } = options;

  const startTime = Date.now();
  let lastProgressOutput = '';

  console.log('\nWaiting for PDF indexing...');

  while (true) {
    const status = await getIndexingStatus(collectionId);
    const total =
      status.completed.length + status.failed.length + status.pending.length;
    const done = status.completed.length + status.failed.length;

    // Call progress callback
    onProgress?.(status.completed.length, total, status.failed.length);

    // Format and display progress
    const progressBar = formatProgressBar(done, total);
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    const eta = formatETA(startTime, done, total);

    const progressOutput = `${progressBar} ${done}/${total} (${percentage}%) | ${status.failed.length} failed | ETA: ${eta}`;

    // Only update if changed (to reduce console spam)
    if (progressOutput !== lastProgressOutput) {
      // Clear line and write new progress
      process.stdout.write(`\r${progressOutput}`);
      lastProgressOutput = progressOutput;
    }

    // Check if done
    if (status.pending.length === 0) {
      console.log('\n'); // New line after progress
      return status;
    }

    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      console.log('\n');
      console.warn(
        `Indexing timeout after ${Math.round(timeoutMs / 60000)} minutes`
      );
      console.warn(`Pending papers: ${status.pending.length}`);
      return status;
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
}

/**
 * Quick status check without waiting
 */
export async function checkIndexingProgress(collectionId: string): Promise<{
  total: number;
  completed: number;
  failed: number;
  pending: number;
  percentComplete: number;
}> {
  const status = await getIndexingStatus(collectionId);

  const total =
    status.completed.length + status.failed.length + status.pending.length;

  return {
    total,
    completed: status.completed.length,
    failed: status.failed.length,
    pending: status.pending.length,
    percentComplete: total > 0 ? (status.completed.length / total) * 100 : 0,
  };
}
