import { cacheRedis } from '../../../config/redis';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import type { NotificationPriority } from '@prisma/client';

/**
 * Per-user rate limit gate. Uses Redis INCR with a 60-second rolling window.
 * CRITICAL priority ALWAYS bypasses the limit (security/payroll must deliver).
 * Fail-open on Redis errors — we'd rather over-deliver than silently drop.
 *
 * Default: 20 notifications per user per minute (env: NOTIFICATIONS_USER_RATE_LIMIT_PER_MIN).
 */
export async function checkUserRateLimit(
  userId: string,
  priority: NotificationPriority,
): Promise<boolean> {
  if (priority === 'CRITICAL') return true;

  const key = `notif:rate:user:${userId}`;
  const max = env.NOTIFICATIONS_USER_RATE_LIMIT_PER_MIN;

  try {
    const count = await cacheRedis.incr(key);
    if (count === 1) await cacheRedis.expire(key, 60);
    if (count > max) {
      logger.warn('User rate limit exceeded, dropping notification', {
        userId,
        count,
        max,
        priority,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('User rate limit check failed (fail-open)', { error: err, userId });
    return true;
  }
}

/**
 * Per-tenant burst protection. 1000/min default. CRITICAL bypasses.
 * Protects the overall system from a single tenant's bug / runaway cron.
 *
 * Default: 1000 notifications per tenant per minute (env: NOTIFICATIONS_TENANT_RATE_LIMIT_PER_MIN).
 */
export async function checkTenantRateLimit(
  companyId: string,
  priority: NotificationPriority,
): Promise<boolean> {
  if (priority === 'CRITICAL') return true;

  const key = `notif:rate:tenant:${companyId}`;
  const max = env.NOTIFICATIONS_TENANT_RATE_LIMIT_PER_MIN;

  try {
    const count = await cacheRedis.incr(key);
    if (count === 1) await cacheRedis.expire(key, 60);
    if (count > max) {
      logger.warn('Tenant rate limit exceeded, dropping notification', {
        companyId,
        count,
        max,
        priority,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('Tenant rate limit check failed (fail-open)', { error: err, companyId });
    return true;
  }
}
