import { cacheRedis } from '../../../../config/redis';
import { env } from '../../../../config/env';
import { logger } from '../../../../config/logger';

export interface CapsResult {
  allowed: boolean;
  reason?: 'WHATSAPP_TENANT_CAP' | 'WHATSAPP_USER_CAP';
}

/**
 * Per-tenant + per-user daily WhatsApp caps (§4A.4 cost controls).
 * Same pattern as SMS caps: 48h TTL, fail-open on Redis error.
 */
export async function checkWhatsappCaps(companyId: string, userId: string): Promise<CapsResult> {
  const today = new Date().toISOString().slice(0, 10);
  const tenantKey = `notif:whatsapp:daily:${companyId}:${today}`;
  const userKey = `notif:whatsapp:daily:${userId}:${today}`;

  try {
    const tenantCount = await cacheRedis.incr(tenantKey);
    if (tenantCount === 1) await cacheRedis.expire(tenantKey, 48 * 3600);
    if (tenantCount > env.NOTIFICATIONS_WHATSAPP_DAILY_CAP_PER_TENANT) {
      logger.warn('WhatsApp tenant daily cap exceeded', {
        companyId,
        tenantCount,
        cap: env.NOTIFICATIONS_WHATSAPP_DAILY_CAP_PER_TENANT,
      });
      return { allowed: false, reason: 'WHATSAPP_TENANT_CAP' };
    }

    const userCount = await cacheRedis.incr(userKey);
    if (userCount === 1) await cacheRedis.expire(userKey, 48 * 3600);
    if (userCount > env.NOTIFICATIONS_WHATSAPP_DAILY_CAP_PER_USER) {
      logger.warn('WhatsApp user daily cap exceeded', {
        userId,
        userCount,
        cap: env.NOTIFICATIONS_WHATSAPP_DAILY_CAP_PER_USER,
      });
      return { allowed: false, reason: 'WHATSAPP_USER_CAP' };
    }

    return { allowed: true };
  } catch (err) {
    logger.warn('WhatsApp caps check failed (fail-open)', { error: err });
    return { allowed: true };
  }
}
