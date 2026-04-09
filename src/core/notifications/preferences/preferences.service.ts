import type { NotificationChannel } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { invalidateUserConsent } from '../dispatch/consent-gate';
import {
  NOTIFICATION_CATEGORIES,
  isCategoryLocked,
} from '../../../shared/constants/notification-categories';
import type { UpdatePreferencesInput } from './preferences.validators';

export const preferencesService = {
  /**
   * Get the current user's notification preferences plus the company master
   * toggles (read-only gate info for the UI).
   * Upserts a default preference row on first access.
   */
  async getForUser(userId: string) {
    let pref = await platformPrisma.userNotificationPreference.findUnique({ where: { userId } });
    if (!pref) {
      pref = await platformPrisma.userNotificationPreference.create({ data: { userId } });
    }

    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    const companySettings = user?.companyId
      ? await platformPrisma.companySettings.findFirst({ where: { companyId: user.companyId } })
      : null;

    const categoryPreferences = await platformPrisma.userNotificationCategoryPreference.findMany({
      where: { userId },
      select: { category: true, channel: true, enabled: true },
    });

    return {
      preference: pref,
      companyMasters: {
        inApp: companySettings?.inAppNotifications ?? true,
        push: companySettings?.pushNotifications ?? true,
        email: companySettings?.emailNotifications ?? true,
        sms: companySettings?.smsNotifications ?? false,
        whatsapp: companySettings?.whatsappNotifications ?? false,
      },
      categoryPreferences,
      categoryCatalogue: NOTIFICATION_CATEGORIES,
    };
  },

  async update(userId: string, data: UpdatePreferencesInput) {
    const cleanData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) cleanData[k] = v;
    }
    const result = await platformPrisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...cleanData },
      update: cleanData,
    });
    // O(1) consent cache invalidation — bumps user version.
    await invalidateUserConsent(userId);
    return result;
  },

  /**
   * Batch-upsert per-category × channel preferences. Locked categories
   * (AUTH) cannot be modified — throws 400 if any locked entry is present.
   * Invalidates the user consent cache once at the end.
   */
  async updateCategoryPreferences(
    userId: string,
    updates: Array<{ category: string; channel: NotificationChannel; enabled: boolean }>,
  ) {
    for (const u of updates) {
      if (isCategoryLocked(u.category)) {
        throw ApiError.badRequest(
          `Category ${u.category} is locked and cannot be modified`,
        );
      }
    }

    await platformPrisma.$transaction(
      updates.map((u) =>
        platformPrisma.userNotificationCategoryPreference.upsert({
          where: {
            userId_category_channel: {
              userId,
              category: u.category,
              channel: u.channel,
            },
          },
          create: {
            userId,
            category: u.category,
            channel: u.channel,
            enabled: u.enabled,
          },
          update: { enabled: u.enabled },
        }),
      ),
    );

    await invalidateUserConsent(userId);
    return this.getForUser(userId);
  },
};
