#!/usr/bin/env tsx
/**
 * Worker Process Starter
 * Starts all BullMQ background workers for development and production
 *
 * Usage:
 *   npm run workers       (development)
 *   tsx scripts/start-workers.ts
 */

// Load environment variables FIRST before importing any modules
// Must use require() because ES module imports are hoisted
// In production, env vars are set by Railway/platform, .env.local is optional
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });

console.log('=================================');
console.log('CiteBite Background Workers');
console.log('=================================');

// Verify Redis connection
if (!process.env.REDIS_URL) {
  console.error('ERROR: REDIS_URL is not configured in environment variables');
  console.error('For local development: set REDIS_URL in .env.local');
  console.error(
    'For production: set REDIS_URL in Railway/platform environment variables'
  );
  process.exit(1);
}

console.log(
  `Redis URL: ${process.env.REDIS_URL.split('@')[1] || 'configured'}`
);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log(
  `Multimodal RAG: ${process.env.ENABLE_MULTIMODAL_RAG !== 'false' ? 'enabled' : 'disabled'}`
);
console.log('=================================\n');

// Start all workers
async function main() {
  try {
    // Dynamic import AFTER dotenv is loaded
    const { startAllWorkers } = await import('../../src/lib/jobs/workers');
    await startAllWorkers();
    console.log('\n✓ All workers started successfully');
    console.log('Press Ctrl+C to stop workers\n');
  } catch (error) {
    console.error('Failed to start workers:', error);
    process.exit(1);
  }

  // Keep process alive
  process.stdin.resume();
}

main();
