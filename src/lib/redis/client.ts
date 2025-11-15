/**
 * Redis Client for Caching
 * Used for caching Semantic Scholar API responses and other data
 */

import Redis from 'ioredis';

// Singleton Redis instance
let redisClient: Redis | null = null;

/**
 * Get or create Redis client instance
 */
export function getRedisClient(): Redis | null {
  // If REDIS_URL is not configured, return null (caching disabled)
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not configured. Caching is disabled.');
    return null;
  }

  // Return existing instance if available
  if (redisClient) {
    return redisClient;
  }

  try {
    // Create new Redis client
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      // Retry strategy: exponential backoff
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    // Handle connection events
    redisClient.on('connect', () => {
      console.log('Redis client connected');
    });

    redisClient.on('error', err => {
      console.error('Redis client error:', err);
    });

    redisClient.on('ready', () => {
      console.log('Redis client ready');
    });

    return redisClient;
  } catch (error) {
    console.error('Failed to create Redis client:', error);
    return null;
  }
}

/**
 * Set a value in cache with TTL
 * @param key Cache key
 * @param value Value to cache (will be JSON stringified)
 * @param ttlSeconds TTL in seconds (default: 24 hours)
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = 24 * 60 * 60
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    await client.setex(key, ttlSeconds, serialized);
    return true;
  } catch (error) {
    console.error('Failed to set cache:', error);
    return false;
  }
}

/**
 * Get a value from cache
 * @param key Cache key
 * @returns Cached value or null if not found/expired
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const cached = await client.get(key);
    if (!cached) {
      return null;
    }

    return JSON.parse(cached) as T;
  } catch (error) {
    console.error('Failed to get cache:', error);
    return null;
  }
}

/**
 * Delete a value from cache
 * @param key Cache key
 */
export async function deleteCache(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Failed to delete cache:', error);
    return false;
  }
}

/**
 * Delete all keys matching a pattern
 * @param pattern Redis key pattern (e.g., "semantic-scholar:*")
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  if (!client) {
    return 0;
  }

  try {
    const keys = await client.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }

    await client.del(...keys);
    return keys.length;
  } catch (error) {
    console.error('Failed to delete cache pattern:', error);
    return 0;
  }
}

/**
 * Close Redis connection (use on app shutdown)
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
