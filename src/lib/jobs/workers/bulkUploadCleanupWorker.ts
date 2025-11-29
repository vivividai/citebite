/**
 * Bulk Upload Cleanup Worker
 * Cleans up expired bulk upload sessions and their temp files
 *
 * This worker runs on a scheduled basis to:
 * 1. Find sessions older than 24 hours
 * 2. Delete temp files from storage
 * 3. Mark sessions as expired in database
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { cleanupTempSession } from '@/lib/storage/supabaseStorage';

// Worker instance
let bulkUploadCleanupWorker: Worker<BulkUploadCleanupJobData> | null = null;

// Job data type
export interface BulkUploadCleanupJobData {
  // Empty for scheduled cleanup - processes all expired sessions
  // Or specify sessionId to clean up a specific session
  sessionId?: string;
  userId?: string;
}

// Session expiry time: 24 hours
const SESSION_EXPIRY_HOURS = 24;

/**
 * Find and clean expired sessions
 */
async function cleanupExpiredSessions(): Promise<{
  processed: number;
  cleaned: number;
  errors: string[];
}> {
  const supabase = createAdminSupabaseClient();
  const errors: string[] = [];

  // Calculate expiry threshold
  const expiryThreshold = new Date();
  expiryThreshold.setHours(expiryThreshold.getHours() - SESSION_EXPIRY_HOURS);

  // Find expired sessions that haven't been cleaned up yet
  const { data: expiredSessions, error: fetchError } = await supabase
    .from('bulk_upload_sessions')
    .select('id, user_id, status')
    .lt('expires_at', expiryThreshold.toISOString())
    .in('status', ['pending', 'matched']) // Only clean pending/matched, not confirmed
    .limit(100); // Process in batches

  if (fetchError) {
    throw new Error(`Failed to fetch expired sessions: ${fetchError.message}`);
  }

  if (!expiredSessions || expiredSessions.length === 0) {
    console.log('[Bulk Upload Cleanup] No expired sessions to clean');
    return { processed: 0, cleaned: 0, errors: [] };
  }

  console.log(
    `[Bulk Upload Cleanup] Found ${expiredSessions.length} expired sessions`
  );

  let cleaned = 0;

  for (const session of expiredSessions) {
    try {
      // Clean up temp files
      const filesDeleted = await cleanupTempSession(
        session.user_id,
        session.id
      );
      console.log(
        `[Bulk Upload Cleanup] Deleted ${filesDeleted} temp files for session ${session.id}`
      );

      // Mark session as expired
      const { error: updateError } = await supabase
        .from('bulk_upload_sessions')
        .update({ status: 'expired' })
        .eq('id', session.id);

      if (updateError) {
        errors.push(
          `Failed to update session ${session.id}: ${updateError.message}`
        );
        continue;
      }

      cleaned++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Failed to clean session ${session.id}: ${errorMessage}`);
    }
  }

  return {
    processed: expiredSessions.length,
    cleaned,
    errors,
  };
}

/**
 * Clean up a specific session
 */
async function cleanupSpecificSession(
  sessionId: string,
  userId: string
): Promise<{ filesDeleted: number }> {
  const supabase = createAdminSupabaseClient();

  // Clean up temp files
  const filesDeleted = await cleanupTempSession(userId, sessionId);
  console.log(
    `[Bulk Upload Cleanup] Deleted ${filesDeleted} temp files for session ${sessionId}`
  );

  // Mark session as expired/cancelled
  const { error: updateError } = await supabase
    .from('bulk_upload_sessions')
    .update({ status: 'expired' })
    .eq('id', sessionId);

  if (updateError) {
    console.error(
      `[Bulk Upload Cleanup] Failed to update session status: ${updateError.message}`
    );
  }

  return { filesDeleted };
}

/**
 * Process cleanup job
 */
async function processBulkUploadCleanup(job: Job<BulkUploadCleanupJobData>) {
  console.log(`[Bulk Upload Cleanup] Processing job ${job.id}`);

  const { sessionId, userId } = job.data;

  // If specific session is provided, clean only that session
  if (sessionId && userId) {
    console.log(
      `[Bulk Upload Cleanup] Cleaning specific session: ${sessionId}`
    );
    const result = await cleanupSpecificSession(sessionId, userId);
    console.log(
      `[Bulk Upload Cleanup] Completed: ${result.filesDeleted} files deleted`
    );
    return result;
  }

  // Otherwise, clean all expired sessions
  console.log(
    '[Bulk Upload Cleanup] Running scheduled cleanup of expired sessions'
  );
  const result = await cleanupExpiredSessions();

  console.log(
    `[Bulk Upload Cleanup] Completed: ${result.cleaned}/${result.processed} sessions cleaned`
  );

  if (result.errors.length > 0) {
    console.warn('[Bulk Upload Cleanup] Errors encountered:', result.errors);
  }

  return result;
}

/**
 * Start bulk upload cleanup worker
 */
export function startBulkUploadCleanupWorker(): Worker<BulkUploadCleanupJobData> | null {
  if (!process.env.REDIS_URL) {
    console.warn(
      'REDIS_URL not configured. Bulk upload cleanup worker will not start.'
    );
    return null;
  }

  if (bulkUploadCleanupWorker) {
    console.log('Bulk upload cleanup worker already running');
    return bulkUploadCleanupWorker;
  }

  const connection = getRedisClient();
  if (!connection) {
    return null;
  }

  bulkUploadCleanupWorker = new Worker<BulkUploadCleanupJobData>(
    'bulk-upload-cleanup',
    processBulkUploadCleanup,
    {
      connection,
      concurrency: 1, // Only one cleanup at a time
    }
  );

  // Event handlers
  bulkUploadCleanupWorker.on('completed', job => {
    console.log(`[Bulk Upload Cleanup] Job ${job.id} completed`);
  });

  bulkUploadCleanupWorker.on('failed', (job, err) => {
    console.error(`[Bulk Upload Cleanup] Job ${job?.id} failed:`, err);
  });

  bulkUploadCleanupWorker.on('error', err => {
    console.error('[Bulk Upload Cleanup] Worker error:', err);
  });

  console.log('Bulk upload cleanup worker started');
  return bulkUploadCleanupWorker;
}

/**
 * Stop bulk upload cleanup worker
 */
export async function stopBulkUploadCleanupWorker(): Promise<void> {
  if (bulkUploadCleanupWorker) {
    await bulkUploadCleanupWorker.close();
    bulkUploadCleanupWorker = null;
    console.log('Bulk upload cleanup worker stopped');
  }
}
