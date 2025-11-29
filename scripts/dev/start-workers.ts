#!/usr/bin/env tsx
/**
 * Worker Process Starter
 * Starts all BullMQ background workers for development and production
 *
 * Usage:
 *   npm run workers       (development)
 *   tsx scripts/start-workers.ts
 */

import { startAllWorkers } from '../../src/lib/jobs/workers';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('=================================');
console.log('CiteBite Background Workers');
console.log('=================================');

// Verify Redis connection
if (!process.env.REDIS_URL) {
  console.error('ERROR: REDIS_URL is not configured in environment variables');
  console.error('Please set REDIS_URL in .env.local file');
  process.exit(1);
}

console.log(
  `Redis URL: ${process.env.REDIS_URL.split('@')[1] || 'configured'}`
);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('=================================\n');

// Start all workers
async function main() {
  try {
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
