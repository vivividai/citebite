/**
 * Global E2E Test Teardown
 * Runs once after all tests to clean up test environment
 */
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function clearRedisQueues() {
  console.log('🧹 Clearing Redis queues...');

  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const queues = [
    new Queue('pdf-download', { connection }),
    new Queue('pdf-indexing', { connection }),
  ];

  for (const queue of queues) {
    try {
      await queue.drain();
      await queue.clean(0, 1000, 'completed');
      await queue.clean(0, 1000, 'failed');
      await queue.clean(0, 1000, 'active');
      await queue.clean(0, 1000, 'delayed');
      console.log(`  ✅ Cleared ${queue.name} queue`);
    } catch (error) {
      console.error(`  ❌ Error clearing ${queue.name}:`, error);
    }
  }

  await Promise.all(queues.map(q => q.close()));
  await connection.quit();
  console.log('✅ Redis queues cleared\n');
}

export default async function globalTeardown() {
  console.log('\n🧹 Starting E2E Test Global Teardown\n');
  console.log('='.repeat(50));
  console.log('\n');

  try {
    // Clear Redis queues to ensure no background jobs are running
    await clearRedisQueues();

    console.log('='.repeat(50));
    console.log('\n✅ Global teardown complete!\n');
  } catch (error) {
    console.error('\n❌ Global teardown failed:', error);
    console.log('\n' + '='.repeat(50) + '\n');
    // Don't throw error in teardown to avoid masking test failures
  }
}
