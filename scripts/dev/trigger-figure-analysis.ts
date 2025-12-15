/**
 * Manual trigger for figure analysis job
 * Usage: npx tsx scripts/dev/trigger-figure-analysis.ts <paperId>
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });

import { Queue } from 'bullmq';
import Redis from 'ioredis';

const paperId = process.argv[2] || '4db4c14ac9aa6809bf0e25809d1698dcacb69c51';
const storageKey = `papers/${paperId}.pdf`;

async function main() {
  if (!process.env.REDIS_URL) {
    console.error('REDIS_URL not configured');
    process.exit(1);
  }

  const redis = new Redis(process.env.REDIS_URL);

  const queue = new Queue('figure-analysis', {
    connection: redis,
  });

  const job = await queue.add('analyze-figures', {
    paperId,
    storageKey,
  });

  console.log(`Added figure analysis job: ${job.id} for paper ${paperId}`);

  await queue.close();
  await redis.quit();
}

main().catch(console.error);
