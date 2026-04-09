import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
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
 */
export interface ConsentCache {
  userId: string;
  companySettings: CompanySettings | null;
  preference: UserNotificationPreference | null;
}

/**
 * Load the consent cache for a user in a single DB round-trip group.
 * Called once per delivery job at the top of the worker handler.
 */
export async function loadConsentCache(userId: string): Promise<ConsentCache> {
  try {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (!user?.companyId) {
      return { userId, companySettings: null, preference: null };
    }
    const [companySettings, preference] = await Promise.all([
      platformPrisma.companySettings.findFirst({ where: { companyId: user.companyId } }),
      platformPrisma.userNotificationPreference.findUnique({ where: { userId } }),
    ]);
    return { userId, companySettings, preference };
  } catch (err) {
    logger.error('Failed to load consent cache', { error: err, userId });
    return { userId, companySettings: null, preference: null };
  }
}

/**
 * Pure consent evaluation — no DB access. Call after loadConsentCache().
 * Use this inside the per-channel worker loop to avoid N+1.
 */
export function evaluateConsent(
  cache: ConsentCache,
  channel: NotificationChannel,
  priority: NotificationPriority,
  systemCritical = false,
): ConsentResult {
  if (channel === 'IN_APP') return { allowed: true };

  const { companySettings, preference } = cache;
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

  // SYSTEM_CRITICAL bypasses user preference + quiet hours
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
export async function checkConsent(input: ConsentInput): Promise<ConsentResult> {
  const cache = await loadConsentCache(input.userId);
  return evaluateConsent(cache, input.channel, input.priority, input.systemCritical);
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
