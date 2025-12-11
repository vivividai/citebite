/**
 * Clear all BullMQ queues to stop ongoing indexing jobs
 */
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function clearAllQueues() {
  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const queues = [
    new Queue('pdf-download', { connection }),
    new Queue('pdf-indexing', { connection }),
  ];

  console.log('🧹 Clearing all queues...\n');

  for (const queue of queues) {
    try {
      // Get queue stats before clearing
      const counts = await queue.getJobCounts();
      console.log(`📊 ${queue.name} queue stats:`);
      console.log(`  - Waiting: ${counts.waiting}`);
      console.log(`  - Active: ${counts.active}`);
      console.log(`  - Completed: ${counts.completed}`);
      console.log(`  - Failed: ${counts.failed}`);
      console.log(`  - Delayed: ${counts.delayed}`);

      // Clear all jobs
      await queue.drain(); // Remove all waiting jobs
      await queue.clean(0, 1000, 'completed'); // Remove completed jobs
      await queue.clean(0, 1000, 'failed'); // Remove failed jobs
      await queue.clean(0, 1000, 'active'); // Remove active jobs
      await queue.clean(0, 1000, 'delayed'); // Remove delayed jobs

      console.log(`✅ Cleared ${queue.name} queue\n`);
    } catch (error) {
      console.error(`❌ Error clearing ${queue.name}:`, error);
    }
  }

  // Close all queues
  await Promise.all(queues.map(q => q.close()));
  await connection.quit();

  console.log('✅ All queues cleared successfully!');
  process.exit(0);
}

clearAllQueues().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
