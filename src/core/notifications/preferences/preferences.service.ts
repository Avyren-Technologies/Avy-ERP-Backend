import { platformPrisma } from '../../../config/database';
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

    return {
      preference: pref,
      companyMasters: {
        inApp: companySettings?.inAppNotifications ?? true,
        push: companySettings?.pushNotifications ?? true,
        email: companySettings?.emailNotifications ?? true,
        sms: companySettings?.smsNotifications ?? false,
        whatsapp: companySettings?.whatsappNotifications ?? false,
      },
    };
  },

  async update(userId: string, data: UpdatePreferencesInput) {
    const cleanData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) cleanData[k] = v;
    }
    return platformPrisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...cleanData },
      update: cleanData,
    });
  },
};
