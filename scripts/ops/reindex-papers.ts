/**
 * Re-index all papers with pending vector_status
 * Adds them to the PDF indexing queue
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const indexQueue = new Queue('pdf-indexing', { connection: redis });

  // Get all papers with pending status that have PDFs in storage
  // storage_path format: {collection_id}/{paper_id}.pdf
  const { data: papers, error } = await supabase
    .from('papers')
    .select('paper_id, storage_path')
    .eq('vector_status', 'pending')
    .not('storage_path', 'is', null);

  if (error) {
    console.error('Error fetching papers:', error);
    process.exit(1);
  }

  const paperCount = papers ? papers.length : 0;
  console.log(`Found ${paperCount} papers to re-index`);

  for (const paper of papers || []) {
    // Extract collection_id from storage_path (format: {collection_id}/{paper_id}.pdf)
    const collectionId = paper.storage_path.split('/')[0];
    const storageKey = paper.storage_path;

    await indexQueue.add(
      `index-${paper.paper_id}`,
      {
        collectionId,
        paperId: paper.paper_id,
        storageKey,
      },
      { jobId: `reindex-${paper.paper_id}` }
    );

    console.log(`Queued: ${paper.paper_id}`);
  }

  console.log(`\nDone! Queued ${paperCount} papers for re-indexing`);

  await indexQueue.close();
  await redis.quit();
}

main().catch(console.error);
