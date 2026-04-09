import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import type { NotificationChannel, NotificationPriority } from '@prisma/client';

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
 * Two-tier consent check.
 *
 * Rules:
 *   - IN_APP is always allowed (system of record).
 *   - CompanySettings master toggle is authoritative for every channel
 *     (company can legally disable SMS/WhatsApp even for critical notifications).
 *   - SYSTEM_CRITICAL bypasses user preference and quiet hours (not company master).
 *   - During quiet hours, LOW/MEDIUM priority is suppressed; HIGH+ delivered.
 */
export async function checkConsent(input: ConsentInput): Promise<ConsentResult> {
  const { userId, channel, priority, systemCritical } = input;

  if (channel === 'IN_APP') return { allowed: true };

  try {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (!user?.companyId) return { allowed: false, reason: 'NO_COMPANY' };

    const settings = await platformPrisma.companySettings.findFirst({
      where: { companyId: user.companyId },
    });
    if (!settings) return { allowed: false, reason: 'NO_COMPANY_SETTINGS' };

    const masterMap: Record<NotificationChannel, keyof typeof settings> = {
      IN_APP: 'inAppNotifications',
      PUSH: 'pushNotifications',
      EMAIL: 'emailNotifications',
      SMS: 'smsNotifications',
      WHATSAPP: 'whatsappNotifications',
    };
    const masterField = masterMap[channel];
    if (!settings[masterField]) return { allowed: false, reason: 'COMPANY_MASTER_OFF' };

    // SYSTEM_CRITICAL bypasses user preference + quiet hours
    if (systemCritical || priority === 'CRITICAL') return { allowed: true };

    const pref = await platformPrisma.userNotificationPreference.findUnique({
      where: { userId },
    });
    if (pref) {
      const userMap: Record<NotificationChannel, keyof typeof pref> = {
        IN_APP: 'inAppEnabled',
        PUSH: 'pushEnabled',
        EMAIL: 'emailEnabled',
        SMS: 'smsEnabled',
        WHATSAPP: 'whatsappEnabled',
      };
      const userField = userMap[channel];
      if (!pref[userField]) return { allowed: false, reason: 'USER_PREF_OFF' };

      if (pref.quietHoursEnabled && pref.quietHoursStart && pref.quietHoursEnd) {
        const tz = settings.timezone ?? 'UTC';
        const now = DateTime.now().setZone(tz);
        if (isInQuietHours(now, pref.quietHoursStart, pref.quietHoursEnd)) {
          if (priority === 'LOW' || priority === 'MEDIUM') {
            return { allowed: false, reason: 'QUIET_HOURS' };
          }
        }
      }
    }

    return { allowed: true };
  } catch (err) {
    logger.error('Consent check failed', { error: err, input });
    return { allowed: false, reason: 'CONSENT_CHECK_ERROR' };
  }
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
