#!/usr/bin/env node
/**
 * Quick test script to verify Redis connection
 * Usage: node scripts/test-redis-connection.js
 */

const Redis = require('ioredis');
require('dotenv').config({ path: '.env.local' });

const redis = new Redis(process.env.REDIS_URL);

console.log('🔍 Testing Redis connection...');
console.log(`📍 URL: ${process.env.REDIS_URL}\n`);

redis
  .ping()
  .then(() => {
    console.log('✅ Redis PING successful');
    return redis.set('test:connection', 'Hello from CiteBite!');
  })
  .then(() => {
    console.log('✅ Redis SET successful');
    return redis.get('test:connection');
  })
  .then(value => {
    console.log(`✅ Redis GET successful: "${value}"`);
    return redis.del('test:connection');
  })
  .then(() => {
    console.log('✅ Redis DEL successful\n');
    console.log('🎉 Redis is working perfectly!');
    redis.disconnect();
  })
  .catch(err => {
    console.error('❌ Redis connection failed:', err.message);
    console.error('\n💡 Troubleshooting:');
    console.error('  1. Check if Redis is running: docker ps | grep redis');
    console.error('  2. Check REDIS_URL in .env.local');
    console.error('  3. Start Redis: docker start citebite-redis\n');
    process.exit(1);
  });
