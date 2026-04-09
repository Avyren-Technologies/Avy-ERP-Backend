import { platformPrisma } from '../../../config/database';
import { cacheRedis } from '../../../config/redis';
import { logger } from '../../../config/logger';
import type { NotificationRule, NotificationTemplate } from '@prisma/client';

export type LoadedRule = NotificationRule & { template: NotificationTemplate };

const CACHE_TTL_SEC = 60;

/**
 * Load active rules for a given (companyId, triggerEvent). Cached in Redis
 * for 60 seconds. The cache stores plain JSON — Dates are serialized as ISO
 * strings and rehydrated below so downstream code keeps getting real Date
 * objects on `createdAt`/`updatedAt`.
 */
export async function loadActiveRules(companyId: string, triggerEvent: string): Promise<LoadedRule[]> {
  const cacheKey = `notif:rules:${companyId}:${triggerEvent}`;
  try {
    const cached = await cacheRedis.get(cacheKey);
    if (cached) {
      const raw = JSON.parse(cached) as Array<
        Omit<LoadedRule, 'createdAt' | 'updatedAt' | 'template'> & {
          createdAt: string;
          updatedAt: string;
          template: Omit<NotificationTemplate, 'createdAt' | 'updatedAt'> & {
            createdAt: string;
            updatedAt: string;
          };
        }
      >;
      return raw.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
        template: {
          ...r.template,
          createdAt: new Date(r.template.createdAt),
          updatedAt: new Date(r.template.updatedAt),
        },
      })) as LoadedRule[];
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
 * Invalidate cached rules for a company. Uses SCAN to avoid the blocking
 * KEYS command, which can freeze Redis for seconds on large keyspaces.
 */
export async function invalidateRuleCache(companyId: string, triggerEvent?: string): Promise<void> {
  try {
    if (triggerEvent) {
      await cacheRedis.del(`notif:rules:${companyId}:${triggerEvent}`);
      return;
    }
    const pattern = `notif:rules:${companyId}:*`;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await cacheRedis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await cacheRedis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn('Rule cache invalidation failed', { error: err });
  }
}
