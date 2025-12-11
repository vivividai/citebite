/**
 * Check BullMQ queue status and list pending/active jobs
 */
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function checkAllQueues() {
  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const queues = [
    new Queue('pdf-download', { connection }),
    new Queue('pdf-indexing', { connection }),
  ];

  console.log('📊 BullMQ Queue Status\n');
  console.log('='.repeat(60));

  for (const queue of queues) {
    try {
      // Get queue stats
      const counts = await queue.getJobCounts();
      const totalJobs =
        counts.waiting +
        counts.active +
        counts.delayed +
        counts.paused +
        counts.waiting_children;

      console.log(`\n📦 ${queue.name.toUpperCase()} QUEUE`);
      console.log('-'.repeat(60));
      console.log(`  ⏳ Waiting: ${counts.waiting}`);
      console.log(`  🔄 Active: ${counts.active}`);
      console.log(`  ⏰ Delayed: ${counts.delayed}`);
      console.log(`  ⏸️  Paused: ${counts.paused}`);
      console.log(`  👶 Waiting Children: ${counts.waiting_children}`);
      console.log(`  ✅ Completed: ${counts.completed}`);
      console.log(`  ❌ Failed: ${counts.failed}`);
      console.log(`  📈 Total Pending: ${totalJobs}`);

      // Show active jobs
      if (counts.active > 0) {
        console.log(`\n  🔄 Active Jobs:`);
        const activeJobs = await queue.getActive(0, 10); // Get first 10 active jobs
        activeJobs.forEach((job, index) => {
          console.log(
            `    ${index + 1}. Job ID: ${job.id} | Data:`,
            JSON.stringify(job.data, null, 2).replace(/\n/g, '\n       ')
          );
        });
      }

      // Show waiting jobs
      if (counts.waiting > 0) {
        console.log(`\n  ⏳ Waiting Jobs:`);
        const waitingJobs = await queue.getWaiting(0, 10); // Get first 10 waiting jobs
        waitingJobs.forEach((job, index) => {
          console.log(
            `    ${index + 1}. Job ID: ${job.id} | Data:`,
            JSON.stringify(job.data, null, 2).replace(/\n/g, '\n       ')
          );
        });
      }

      // Show failed jobs
      if (counts.failed > 0) {
        console.log(`\n  ❌ Failed Jobs:`);
        const failedJobs = await queue.getFailed(0, 5); // Get first 5 failed jobs
        failedJobs.forEach((job, index) => {
          console.log(
            `    ${index + 1}. Job ID: ${job.id} | Data:`,
            JSON.stringify(job.data, null, 2).replace(/\n/g, '\n       ')
          );
          if (job.failedReason) {
            console.log(`       ❌ Reason: ${job.failedReason}`);
          }
        });
      }
    } catch (error) {
      console.error(`❌ Error checking ${queue.name}:`, error);
    }
  }

  console.log('\n' + '='.repeat(60));

  // Close all queues
  await Promise.all(queues.map(q => q.close()));
  await connection.quit();

  console.log('\n✅ Queue check completed!\n');
  process.exit(0);
}

checkAllQueues().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
