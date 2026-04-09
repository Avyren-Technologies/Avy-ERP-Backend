import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';
import { cacheRedis } from '../../../config/redis';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { isCategoryLocked } from '../../../shared/constants/notification-categories';
import type {
  CompanySettings,
  NotificationChannel,
  NotificationPriority,
  UserNotificationPreference,
} from '@prisma/client';

export interface ConsentInput {
  userId: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  systemCritical?: boolean;
}

export interface ConsentResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Cache of per-user consent data fetched once per worker job.
 * Avoids N+1 DB lookups when a job has multiple channels.
 *
 * `categoryPrefs` is a `Map<"category:channel", enabled>` for O(1) lookup
 * during `evaluateConsent`. Empty map = no overrides, use channel defaults.
 */
export interface ConsentCache {
  userId: string;
  companySettings: CompanySettings | null;
  preference: UserNotificationPreference | null;
  categoryPrefs: Map<string, boolean>;
}

/**
 * Serialized cache payload. Map is stored as an array of [key, value] pairs
 * because JSON.stringify can't handle Map directly.
 */
interface SerializedCache {
  userId: string;
  companySettings: CompanySettings | null;
  preference: UserNotificationPreference | null;
  categoryPrefs: Array<[string, boolean]>;
}

async function getVersion(scope: 'user' | 'company', id: string): Promise<number> {
  try {
    const v = await cacheRedis.get(`notif:consent:v:${scope}:${id}`);
    return v ? parseInt(v, 10) : 1;
  } catch {
    return 1;
  }
}

/**
 * DB-only fetch path — bypasses cache. Used by `loadConsentCache` on cache miss
 * and by tests/one-off callers that want fresh data.
 */
async function loadConsentCacheFromDB(userId: string): Promise<ConsentCache> {
  try {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (!user?.companyId) {
      return { userId, companySettings: null, preference: null, categoryPrefs: new Map() };
    }
    const [companySettings, preference, categoryRows] = await Promise.all([
      platformPrisma.companySettings.findFirst({ where: { companyId: user.companyId } }),
      platformPrisma.userNotificationPreference.findUnique({ where: { userId } }),
      platformPrisma.userNotificationCategoryPreference.findMany({
        where: { userId },
        select: { category: true, channel: true, enabled: true },
      }),
    ]);
    const categoryPrefs = new Map<string, boolean>();
    for (const row of categoryRows) {
      categoryPrefs.set(`${row.category}:${row.channel}`, row.enabled);
    }
    return { userId, companySettings, preference, categoryPrefs };
  } catch (err) {
    logger.error('Failed to load consent cache from DB', { error: err, userId });
    return { userId, companySettings: null, preference: null, categoryPrefs: new Map() };
  }
}

/**
 * Read-through cache with versioned keys for O(1) invalidation.
 *
 * Strategy:
 *   - Key includes both the user version and company version counters.
 *   - Bumping `notif:consent:v:user:{userId}` or `notif:consent:v:company:{companyId}`
 *     makes all existing cached entries stale — they reference an old version.
 *   - Stale entries age out naturally via TTL (300s default).
 *
 * Benefits over loop-users invalidation:
 *   - Single INCR call regardless of company size
 *   - No thundering herd when large company's settings change
 *   - Next read per user lazily refreshes
 */
export async function loadConsentCache(userId: string): Promise<ConsentCache> {
  // Resolve company once — need it for the version key.
  let companyId: string | null = null;
  try {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    companyId = user?.companyId ?? null;
  } catch (err) {
    logger.warn('Consent cache user lookup failed', { error: err, userId });
  }

  if (!companyId) {
    // Can't cache without a company version; fall through to DB
    return loadConsentCacheFromDB(userId);
  }

  const [uv, cv] = await Promise.all([getVersion('user', userId), getVersion('company', companyId)]);
  const cacheKey = `notif:consent:${userId}:${uv}:${cv}`;

  try {
    const cached = await cacheRedis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as SerializedCache;
      return {
        ...parsed,
        // rehydrate Date fields on companySettings / preference
        companySettings: parsed.companySettings
          ? (parsed.companySettings as CompanySettings)
          : null,
        preference: parsed.preference
          ? (parsed.preference as UserNotificationPreference)
          : null,
        categoryPrefs: new Map(parsed.categoryPrefs),
      };
    }
  } catch (err) {
    logger.warn('Consent cache read failed', { error: err, userId });
  }

  const fresh = await loadConsentCacheFromDB(userId);

  try {
    const serialized: SerializedCache = {
      userId: fresh.userId,
      companySettings: fresh.companySettings,
      preference: fresh.preference,
      categoryPrefs: Array.from(fresh.categoryPrefs.entries()),
    };
    await cacheRedis.set(
      cacheKey,
      JSON.stringify(serialized),
      'EX',
      env.NOTIFICATIONS_CONSENT_CACHE_TTL_SEC,
    );
  } catch (err) {
    logger.warn('Consent cache write failed (non-fatal)', { error: err, userId });
  }

  return fresh;
}

/**
 * O(1) per-user invalidation. Bumps the user's version counter; stale cache
 * entries reference the old version and expire naturally via TTL.
 *
 * Call on: preference update, category preference update, logout.
 */
export async function invalidateUserConsent(userId: string): Promise<void> {
  try {
    await cacheRedis.incr(`notif:consent:v:user:${userId}`);
  } catch (err) {
    logger.warn('User consent version bump failed', { error: err, userId });
  }
}

/**
 * O(1) per-company invalidation. Affects every user in the company on their
 * next dispatch without looping the user table.
 *
 * Call on: CompanySettings notification-toggle change.
 */
export async function invalidateCompanyConsent(companyId: string): Promise<void> {
  try {
    await cacheRedis.incr(`notif:consent:v:company:${companyId}`);
  } catch (err) {
    logger.warn('Company consent version bump failed', { error: err, companyId });
  }
}

/**
 * Pure consent evaluation — no DB access. Call after loadConsentCache().
 * Use this inside the per-channel worker loop to avoid N+1.
 *
 * @param category Optional notification category (e.g. LEAVE, PAYROLL).
 *                 When set, checks `UserNotificationCategoryPreference` for
 *                 fine-grained overrides. Locked categories (AUTH) cannot be
 *                 overridden — the check is skipped.
 */
export function evaluateConsent(
  cache: ConsentCache,
  channel: NotificationChannel,
  priority: NotificationPriority,
  category: string | null = null,
  systemCritical = false,
): ConsentResult {
  if (channel === 'IN_APP') return { allowed: true };

  const { companySettings, preference, categoryPrefs } = cache;
  if (!companySettings) return { allowed: false, reason: 'NO_COMPANY_SETTINGS' };

  const masterMap: Record<NotificationChannel, keyof CompanySettings> = {
    IN_APP: 'inAppNotifications',
    PUSH: 'pushNotifications',
    EMAIL: 'emailNotifications',
    SMS: 'smsNotifications',
    WHATSAPP: 'whatsappNotifications',
  };
  const masterField = masterMap[channel];
  if (!companySettings[masterField]) return { allowed: false, reason: 'COMPANY_MASTER_OFF' };

  // SYSTEM_CRITICAL bypasses user preference + quiet hours + category prefs
  if (systemCritical || priority === 'CRITICAL') return { allowed: true };

  if (preference) {
    const userMap: Record<NotificationChannel, keyof UserNotificationPreference> = {
      IN_APP: 'inAppEnabled',
      PUSH: 'pushEnabled',
      EMAIL: 'emailEnabled',
      SMS: 'smsEnabled',
      WHATSAPP: 'whatsappEnabled',
    };
    const userField = userMap[channel];
    if (!preference[userField]) return { allowed: false, reason: 'USER_PREF_OFF' };

    if (preference.quietHoursEnabled && preference.quietHoursStart && preference.quietHoursEnd) {
      const tz = companySettings.timezone ?? 'UTC';
      const now = DateTime.now().setZone(tz);
      if (isInQuietHours(now, preference.quietHoursStart, preference.quietHoursEnd)) {
        if (priority === 'LOW' || priority === 'MEDIUM') {
          return { allowed: false, reason: 'QUIET_HOURS' };
        }
      }
    }
  }

  // Per-category override — only applies if not locked and a row exists.
  // Missing row means "use channel default" (current behavior).
  if (category && !isCategoryLocked(category)) {
    const catEnabled = categoryPrefs.get(`${category}:${channel}`);
    if (catEnabled === false) return { allowed: false, reason: 'CATEGORY_PREF_OFF' };
  }

  return { allowed: true };
}

/**
 * Legacy one-shot consent check — fetches the cache AND evaluates in one call.
 *
 * Two-tier consent rules:
 *   - IN_APP is always allowed (system of record).
 *   - CompanySettings master toggle is authoritative for every channel
 *     (company can legally disable SMS/WhatsApp even for critical notifications).
 *   - SYSTEM_CRITICAL bypasses user preference and quiet hours (not company master).
 *   - During quiet hours, LOW/MEDIUM priority is suppressed; HIGH+ delivered.
 *
 * Retained for backward compat. Hot-path workers should use
 * `loadConsentCache` + `evaluateConsent` directly to avoid N+1.
 */
export async function checkConsent(
  input: ConsentInput & { category?: string | null },
): Promise<ConsentResult> {
  const cache = await loadConsentCache(input.userId);
  return evaluateConsent(
    cache,
    input.channel,
    input.priority,
    input.category ?? null,
    input.systemCritical,
  );
}

function isInQuietHours(now: DateTime, startStr: string, endStr: string): boolean {
  const [sH, sM] = startStr.split(':').map(Number);
  const [eH, eM] = endStr.split(':').map(Number);
  if (sH == null || sM == null || eH == null || eM == null) return false;
  const currentMin = now.hour * 60 + now.minute;
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  if (startMin <= endMin) return currentMin >= startMin && currentMin < endMin;
  // Overnight range (e.g. 22:00 → 07:00)
  return currentMin >= startMin || currentMin < endMin;
}
