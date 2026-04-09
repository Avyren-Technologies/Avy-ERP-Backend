import { cacheRedis } from '../../../config/redis';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { pickQueueByPriority } from '../queue/queues';
import type { QueueablePayload } from './types';

/**
 * Enqueue a delivery job, applying dynamic batching for LOW/MEDIUM.
 *
 * Batching semantics:
 *   - groupKey = userId + category + entityType (never cross entity types)
 *   - sliding window = NOTIFICATIONS_BATCH_WINDOW_SEC (default 300s)
 *   - if pending count >= threshold, delay new job by min(60s, (count+1)*5s)
 *   - HIGH/CRITICAL never batched
 */
export async function enqueueWithBatching(payload: QueueablePayload): Promise<void> {
  const queue = pickQueueByPriority(payload.priority);

  const canBatch =
    (payload.priority === 'LOW' || payload.priority === 'MEDIUM') &&
    !!payload.category &&
    !!payload.entityType;

  if (canBatch) {
    const batchKey = `notif:batch:${payload.userId}:${payload.category}:${payload.entityType}`;
    const windowMs = env.NOTIFICATIONS_BATCH_WINDOW_SEC * 1000;
    const now = Date.now();
    try {
      await cacheRedis.zremrangebyscore(batchKey, 0, now - windowMs);
      const pending = await cacheRedis.zcard(batchKey);
      await cacheRedis.zadd(batchKey, now, payload.notificationId);
      await cacheRedis.expire(batchKey, env.NOTIFICATIONS_BATCH_WINDOW_SEC);

      if (pending >= env.NOTIFICATIONS_BATCH_THRESHOLD) {
        // Spec formula: holdMs = min(60s, pendingCount × 5s)
        const holdMs = Math.min(60_000, pending * 5_000);
        await queue.add('deliver', payload, { delay: holdMs });
        logger.info('Notification enqueued with batching delay', {
          notificationId: payload.notificationId,
          holdMs,
          pending,
        });
        return;
      }
    } catch (err) {
      logger.warn('Batching check failed, enqueuing immediately', { error: err });
    }
  }

  await queue.add('deliver', payload);
}
