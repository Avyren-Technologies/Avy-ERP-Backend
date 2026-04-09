import { cacheRedis } from '../../../../config/redis';
import { env } from '../../../../config/env';
import { logger } from '../../../../config/logger';

export interface CapsResult {
  allowed: boolean;
  reason?: 'SMS_TENANT_CAP' | 'SMS_USER_CAP';
}

/**
 * Enforce per-tenant and per-user daily SMS caps via Redis INCR counters.
 * Returns `{ allowed: false, reason }` if either cap is exceeded.
 *
 * 48-hour TTL on counters to cover timezone drift and late-night bursts.
 * Fail-open on Redis errors — we'd rather over-send than silently drop,
 * and the downstream provider still enforces its own quotas.
 */
export async function checkSmsCaps(companyId: string, userId: string): Promise<CapsResult> {
  const today = new Date().toISOString().slice(0, 10);
  const tenantKey = `notif:sms:daily:${companyId}:${today}`;
  const userKey = `notif:sms:daily:${userId}:${today}`;

  try {
    const tenantCount = await cacheRedis.incr(tenantKey);
    if (tenantCount === 1) await cacheRedis.expire(tenantKey, 48 * 3600);
    if (tenantCount > env.NOTIFICATIONS_SMS_DAILY_CAP_PER_TENANT) {
      logger.warn('SMS tenant daily cap exceeded', {
        companyId,
        tenantCount,
        cap: env.NOTIFICATIONS_SMS_DAILY_CAP_PER_TENANT,
      });
      return { allowed: false, reason: 'SMS_TENANT_CAP' };
    }

    const userCount = await cacheRedis.incr(userKey);
    if (userCount === 1) await cacheRedis.expire(userKey, 48 * 3600);
    if (userCount > env.NOTIFICATIONS_SMS_DAILY_CAP_PER_USER) {
      logger.warn('SMS user daily cap exceeded', {
        userId,
        userCount,
        cap: env.NOTIFICATIONS_SMS_DAILY_CAP_PER_USER,
      });
      return { allowed: false, reason: 'SMS_USER_CAP' };
    }

    return { allowed: true };
  } catch (err) {
    logger.warn('SMS caps check failed (fail-open)', { error: err });
    return { allowed: true };
  }
}
