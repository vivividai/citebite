import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import 'dotenv/config';

async function reindex() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const collectionId = '373dc74b-1ca7-479d-9bb8-8268d202b609';
  const paperId = '204e3073870fae3d05bcbc2f6a8e263d9b72e776';

  // Delete existing chunks
  const { error: deleteError } = await supabase
    .from('paper_chunks')
    .delete()
    .eq('paper_id', paperId)
    .eq('collection_id', collectionId);

  if (deleteError) {
    console.error('Delete error:', deleteError);
    return;
  }
  console.log('Deleted existing chunks');

  // Reset paper status
  const { error: updateError } = await supabase
    .from('papers')
    .update({ vector_status: 'pending' })
    .eq('paper_id', paperId);

  if (updateError) {
    console.error('Update error:', updateError);
    return;
  }
  console.log('Reset paper status to pending');

  // Add indexing job
  const redis = new Redis(process.env.REDIS_URL!);
  const queue = new Queue('pdf-indexing', { connection: redis });
  const job = await queue.add('index-pdf', { collectionId, paperId });
  console.log('Added indexing job:', job?.id);

  await queue.close();
  await redis.quit();
}

reindex();
