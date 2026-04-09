import { cacheRedis } from '../../../config/redis';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

function key(notificationId: string, channel: string): string {
  return `notif:sent:${notificationId}:${channel}`;
}

/**
 * Atomically claim the right to send a (notification, channel) pair.
 *
 * Returns true if the caller won the claim (and must perform the send),
 * false if another worker already claimed it (caller must skip).
 *
 * Implementation: single SET NX EX call. Both the check and the claim happen
 * in one Redis round-trip so two workers racing on the same job cannot both
 * succeed. This matches spec §3.3 rule 17.
 *
 * Fail-open: on Redis error, we return true (caller sends). We'd rather
 * risk a duplicate than silently drop a notification.
 */
export async function claimSendSlot(notificationId: string, channel: string): Promise<boolean> {
  try {
    const result = await cacheRedis.set(
      key(notificationId, channel),
      '1',
      'EX',
      env.NOTIFICATIONS_IDEMPOTENCY_TTL_SEC,
      'NX',
    );
    // 'OK' means we set it (won the claim). null means key already existed.
    return result === 'OK';
  } catch (err) {
    logger.warn('Idempotency claim failed (fail-open)', { error: err });
    return true;
  }
}

/**
 * Release a previously-claimed slot. Call this on send failure so that
 * BullMQ retries can re-attempt. On success, leave the slot claimed for
 * the full TTL to suppress duplicate retries.
 */
export async function releaseSendSlot(notificationId: string, channel: string): Promise<void> {
  try {
    await cacheRedis.del(key(notificationId, channel));
  } catch (err) {
    logger.warn('Idempotency release failed (ignored)', { error: err });
  }
}
