/**
 * Test Cleanup API
 * DELETE /api/test/cleanup - Clean up test data (collections, papers, etc.)
 *
 * SECURITY: This endpoint only works in test/development environments
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * DELETE /api/test/cleanup
 * Clean up test data created during E2E tests
 */
export async function DELETE(request: NextRequest) {
  // SECURITY: Only allow in test/development environments
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test endpoints not available in production' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { testId } = body;

    const supabase = await createServerSupabaseClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let deletedCollections = 0;

    if (testId) {
      // Clean up specific test collection
      const { error: deleteError } = await supabase
        .from('collections')
        .delete()
        .eq('user_id', user.id)
        .eq('id', testId);

      if (deleteError) {
        console.error('Error deleting test collection:', deleteError);
      } else {
        deletedCollections = 1;
      }
    } else {
      // Clean up all user's collections (careful!)
      const { error: deleteError, count } = await supabase
        .from('collections')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('Error deleting all collections:', deleteError);
      } else {
        deletedCollections = count || 0;
      }
    }

    // Clear Redis queues
    await clearRedisQueues();

    return NextResponse.json({
      success: true,
      message: 'Test data cleaned up successfully',
      stats: {
        deletedCollections,
      },
    });
  } catch (error) {
    console.error('Error cleaning up test data:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to clean up test data',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

async function clearRedisQueues() {
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
    } catch (error) {
      console.error(`Error clearing ${queue.name}:`, error);
    }
  }

  await Promise.all(queues.map(q => q.close()));
  await connection.quit();
}
