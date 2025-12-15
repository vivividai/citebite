/**
 * Check figure analysis queue status
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });

import { Queue } from 'bullmq';
import Redis from 'ioredis';

async function main() {
  if (!process.env.REDIS_URL) {
    console.error('REDIS_URL not configured');
    process.exit(1);
  }

  const redis = new Redis(process.env.REDIS_URL);

  const queue = new Queue('figure-analysis', {
    connection: redis,
  });

  const waiting = await queue.getWaiting();
  const active = await queue.getActive();
  const completed = await queue.getCompleted();
  const failed = await queue.getFailed();

  console.log('📊 Figure Analysis Queue Status');
  console.log('================================');
  console.log(`⏳ Waiting: ${waiting.length}`);
  console.log(`🔄 Active: ${active.length}`);
  console.log(`✅ Completed: ${completed.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (waiting.length > 0) {
    console.log('\n⏳ Waiting Jobs:');
    for (const job of waiting.slice(0, 5)) {
      console.log(`  - Job ${job.id}: ${job.data.paperId}`);
    }
  }

  if (active.length > 0) {
    console.log('\n🔄 Active Jobs:');
    for (const job of active) {
      console.log(`  - Job ${job.id}: ${job.data.paperId}`);
    }
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed Jobs:');
    for (const job of failed.slice(0, 5)) {
      console.log(`  - Job ${job.id}: ${job.data.paperId}`);
      console.log(`    Error: ${job.failedReason}`);
    }
  }

  await queue.close();
  await redis.quit();
}

main().catch(console.error);
