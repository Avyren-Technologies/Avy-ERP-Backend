import IORedis from 'ioredis';
import { env } from '../../../config/env';

const redisUrl = new URL(env.REDIS_URL);

/**
 * Dedicated ioredis connection for BullMQ.
 * BullMQ requires maxRetriesPerRequest=null and enableReadyCheck=false.
 * Uses the same Redis instance as legacy Bull queues, isolated via prefix namespace.
 */
export const bullmqConnection = new IORedis({
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port, 10) || 6379,
  ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
  ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  db: env.REDIS_QUEUE_DB,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const BULLMQ_PREFIX = 'bullmq';
