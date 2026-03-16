import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';
import { getRedisModulePrefix } from '../shared/utils';

const redisUrl = new URL(env.REDIS_URL);

// Parse Redis URL
const getRedisConfig = (db: number) => {
  return {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port, 10) || 6379,
    ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
    ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
    db,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
  };
};

export const getBullQueueConfig = (moduleName: string) => ({
  redis: {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port, 10) || 6379,
    ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
    ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
    db: env.REDIS_QUEUE_DB,
  },
  prefix: getRedisModulePrefix(moduleName, 'queue'),
  defaultJobOptions: {
    removeOnComplete: env.QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: env.QUEUE_REMOVE_ON_FAIL,
  },
});

// Cache Redis instance
export const cacheRedis = new Redis(getRedisConfig(env.REDIS_CACHE_DB));

// Queue Redis instance
export const queueRedis = new Redis(getRedisConfig(env.REDIS_QUEUE_DB));

// Redis connection event handlers
function setupRedisEvents(redis: Redis, name: string) {
  redis.on('connect', () => {
    logger.info(`✅ ${name} Redis connected`);
  });

  redis.on('ready', () => {
    logger.info(`✅ ${name} Redis ready`);
  });

  redis.on('error', (error) => {
    logger.error(`❌ ${name} Redis error:`, error);
  });

  redis.on('close', () => {
    logger.warn(`⚠️ ${name} Redis connection closed`);
  });

  redis.on('reconnecting', () => {
    logger.info(`🔄 ${name} Redis reconnecting...`);
  });
}

setupRedisEvents(cacheRedis, 'Cache');
setupRedisEvents(queueRedis, 'Queue');

// Health check functions
export async function checkRedisConnection(redis: Redis, name: string): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error(`❌ ${name} Redis health check failed:`, error);
    return false;
  }
}

export async function checkAllRedisConnections(): Promise<boolean> {
  const cacheOk = await checkRedisConnection(cacheRedis, 'Cache');
  const queueOk = await checkRedisConnection(queueRedis, 'Queue');

  return cacheOk && queueOk;
}

// Scan all keys matching a pattern and delete them in batches.
// Uses the non-blocking SCAN cursor instead of the blocking KEYS command.
export async function scanAndDelete(redis: Redis, pattern: string): Promise<number> {
  let cursor = '0';
  let deleted = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');
  return deleted;
}

// Graceful shutdown
export async function disconnectRedis(): Promise<void> {
  try {
    await Promise.all([
      cacheRedis.disconnect(),
      queueRedis.disconnect(),
    ]);
    logger.info('✅ All Redis connections disconnected');
  } catch (error) {
    logger.error('❌ Error disconnecting Redis:', error);
  }
}
