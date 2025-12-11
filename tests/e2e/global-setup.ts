/**
 * Global E2E Test Setup
 * Runs once before all tests to ensure a clean test environment
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const execAsync = promisify(exec);
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

async function resetSupabaseDatabase() {
  console.log('🗄️  Resetting Supabase database...');

  try {
    // Reset database (applies all migrations and seeds)
    const { stdout, stderr } = await execAsync(
      'npx supabase db reset --db-url $DATABASE_URL'
    );

    if (stderr && !stderr.includes('Applied migration')) {
      console.warn('  ⚠️  Database reset warnings:', stderr);
    }

    if (stdout) {
      console.log('  📝 Database reset output:', stdout.trim());
    }

    console.log('✅ Supabase database reset complete\n');
  } catch (error) {
    console.error('❌ Failed to reset Supabase database:', error);
    throw error;
  }
}

async function verifyEnvironment() {
  console.log('🔍 Verifying test environment...');

  // Check required environment variables
  const requiredVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];
  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error(
      '❌ Missing required environment variables:',
      missing.join(', ')
    );
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  // Verify TEST_PAPER_LIMIT is set
  const paperLimit = process.env.TEST_PAPER_LIMIT;
  if (!paperLimit) {
    console.warn('  ⚠️  TEST_PAPER_LIMIT not set, using default (10)');
    process.env.TEST_PAPER_LIMIT = '10';
  } else {
    console.log(`  📊 TEST_PAPER_LIMIT: ${paperLimit}`);
  }

  console.log('✅ Environment verification complete\n');
}

export default async function globalSetup() {
  console.log('\n🚀 Starting E2E Test Global Setup\n');
  console.log('='.repeat(50));
  console.log('\n');

  try {
    // 1. Verify environment
    await verifyEnvironment();

    // 2. Clear Redis queues
    await clearRedisQueues();

    // 3. Reset Supabase database
    await resetSupabaseDatabase();

    console.log('='.repeat(50));
    console.log('\n✅ Global setup complete! Ready to run tests.\n');
  } catch (error) {
    console.error('\n❌ Global setup failed:', error);
    console.log('\n' + '='.repeat(50) + '\n');
    throw error;
  }
}
