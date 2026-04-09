import { cacheRedis } from '../../../config/redis';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

function key(notificationId: string, channel: string): string {
  return `notif:sent:${notificationId}:${channel}`;
}

/**
 * Check whether a (notification, channel) pair has already been marked as sent.
 * Used at the worker-level to prevent BullMQ retries from sending twice after
 * a partial success (e.g. SEND succeeded but the event record write failed).
 */
export async function isAlreadySent(notificationId: string, channel: string): Promise<boolean> {
  try {
    const exists = await cacheRedis.get(key(notificationId, channel));
    return exists !== null;
  } catch (err) {
    logger.warn('Idempotency check failed (fail-open)', { error: err });
    return false;
  }
}

/**
 * Mark a (notification, channel) pair as sent. 24h TTL by default.
 */
export async function markSent(notificationId: string, channel: string): Promise<void> {
  try {
    await cacheRedis.set(
      key(notificationId, channel),
      '1',
      'EX',
      env.NOTIFICATIONS_IDEMPOTENCY_TTL_SEC,
      'NX',
    );
  } catch (err) {
    logger.warn('Idempotency mark failed (ignored)', { error: err });
  }
}
