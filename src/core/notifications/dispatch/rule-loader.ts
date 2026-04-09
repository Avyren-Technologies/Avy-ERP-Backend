import { platformPrisma } from '../../../config/database';
import { cacheRedis } from '../../../config/redis';
import { logger } from '../../../config/logger';
import type { NotificationRule, NotificationTemplate } from '@prisma/client';

export type LoadedRule = NotificationRule & { template: NotificationTemplate };

const CACHE_TTL_SEC = 60;

/**
 * Load active rules for a given (companyId, triggerEvent). Cached in Redis
 * for 60 seconds to avoid repeated lookups under burst.
 * Cache miss → DB query → write-through.
 */
export async function loadActiveRules(companyId: string, triggerEvent: string): Promise<LoadedRule[]> {
  const cacheKey = `notif:rules:${companyId}:${triggerEvent}`;
  try {
    const cached = await cacheRedis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as LoadedRule[];
    }
  } catch (err) {
    logger.warn('Rule cache read failed', { error: err });
  }

  const rules = await platformPrisma.notificationRule.findMany({
    where: { companyId, triggerEvent, isActive: true },
    include: { template: true },
  });

  try {
    await cacheRedis.set(cacheKey, JSON.stringify(rules), 'EX', CACHE_TTL_SEC);
  } catch (err) {
    logger.warn('Rule cache write failed', { error: err });
  }
  return rules as LoadedRule[];
}

/**
 * Invalidate cached rules for a company. Call after rule/template CRUD.
 */
export async function invalidateRuleCache(companyId: string, triggerEvent?: string): Promise<void> {
  try {
    if (triggerEvent) {
      await cacheRedis.del(`notif:rules:${companyId}:${triggerEvent}`);
    } else {
      const keys = await cacheRedis.keys(`notif:rules:${companyId}:*`);
      if (keys.length > 0) await cacheRedis.del(...keys);
    }
  } catch (err) {
    logger.warn('Rule cache invalidation failed', { error: err });
  }
}
