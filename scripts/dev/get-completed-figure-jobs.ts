/**
 * Get completed figure analysis jobs with paper IDs
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

  const completed = await queue.getCompleted(0, 10);

  console.log('✅ Recent Completed Jobs:');
  for (const job of completed) {
    const result = job.returnvalue as { figuresIndexed?: number };
    console.log(
      `  - Job ${job.id}: ${job.data.paperId} (${result?.figuresIndexed || 0} figures)`
    );
  }

  await queue.close();
  await redis.quit();
}

main().catch(console.error);
