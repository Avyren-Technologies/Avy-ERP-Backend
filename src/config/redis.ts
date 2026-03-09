import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

// Parse Redis URL
const getRedisConfig = (db: number) => {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    db,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
  };
};

// Cache Redis instance
export const cacheRedis = new Redis(getRedisConfig(env.REDIS_CACHE_DB));

// Queue Redis instance
export const queueRedis = new Redis(getRedisConfig(env.REDIS_QUEUE_DB));

// Session Redis instance
export const sessionRedis = new Redis(getRedisConfig(env.REDIS_SESSION_DB));

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
setupRedisEvents(sessionRedis, 'Session');

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
  const sessionOk = await checkRedisConnection(sessionRedis, 'Session');

  return cacheOk && queueOk && sessionOk;
}

// Graceful shutdown
export async function disconnectRedis(): Promise<void> {
  try {
    await Promise.all([
      cacheRedis.disconnect(),
      queueRedis.disconnect(),
      sessionRedis.disconnect(),
    ]);
    logger.info('✅ All Redis connections disconnected');
  } catch (error) {
    logger.error('❌ Error disconnecting Redis:', error);
  }
}