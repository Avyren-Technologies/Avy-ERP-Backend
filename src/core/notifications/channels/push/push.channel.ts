import { platformPrisma } from '../../../../config/database';
import { logger } from '../../../../config/logger';
import { maskForChannel } from '../../templates/masker';
import { expoProvider } from './expo.provider';
import { fcmProvider } from './fcm.provider';
import type { ChannelSendArgs, ChannelSendResult } from '../channel-router';

/**
 * Push channel entry point. Routes to Expo or FCM based on device token type.
 *
 * Flow:
 *   1. Fetch active devices for the user (scoped strictly to this userId).
 *   2. Apply device strategy (ALL vs LATEST_ONLY) from preferences.
 *   3. Partition devices by tokenType (EXPO → Expo SDK, FCM_WEB/FCM_NATIVE → firebase-admin).
 *   4. Apply PUSH-channel masking from the template's sensitiveFields.
 *   5. Send to both providers in parallel; surface first successful result.
 *   6. Deactivate DeviceNotRegistered tokens scoped by userId (avoid cross-user deactivation).
 */
export const pushChannel = {
  async send({ notificationId, userId, traceId, priority }: ChannelSendArgs): Promise<ChannelSendResult> {
    const devices = await platformPrisma.userDevice.findMany({
      where: { userId, isActive: true },
    });
    if (devices.length === 0) {
      throw Object.assign(new Error('NO_ACTIVE_DEVICES'), { code: 'NO_ACTIVE_DEVICES' });
    }

    const pref = await platformPrisma.userNotificationPreference.findUnique({ where: { userId } });
    const sorted = [...devices].sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
    const targetDevices =
      pref?.deviceStrategy === 'LATEST_ONLY' && sorted[0] ? [sorted[0]] : devices;

    const expoDevices = targetDevices.filter((d) => d.tokenType === 'EXPO');
    const fcmDevices = targetDevices.filter(
      (d) => d.tokenType === 'FCM_WEB' || d.tokenType === 'FCM_NATIVE',
    );

    const notif = await platformPrisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
    const template = notif.templateId
      ? await platformPrisma.notificationTemplate.findUnique({ where: { id: notif.templateId } })
      : null;
    const sensitiveFields = (template?.sensitiveFields as string[] | null) ?? [];

    const masked = maskForChannel(
      'PUSH',
      {
        title: notif.title,
        body: notif.body,
        data: (notif.data as Record<string, unknown> | null) ?? undefined,
      },
      sensitiveFields,
    );

    // Extract image URL from notification data for rich push.
    // Callers pass it as `image_url` in tokens (e.g., announcements, payslip PDFs).
    const dataObj = (masked.data ?? {}) as Record<string, unknown>;
    const imageUrl =
      typeof dataObj.image_url === 'string' && dataObj.image_url.startsWith('http')
        ? dataObj.image_url
        : undefined;

    const payload = {
      title: masked.title,
      body: masked.body,
      data: dataObj,
      priority,
      imageUrl,
    };

    const results = await Promise.allSettled([
      expoDevices.length > 0 ? expoProvider.send(expoDevices, payload, traceId) : Promise.resolve(null),
      fcmDevices.length > 0 ? fcmProvider.send(fcmDevices, payload, traceId) : Promise.resolve(null),
    ]);

    // Deactivate dead tokens SCOPED BY USER ID to prevent cross-user deactivation
    // (the unique is @@unique([userId, fcmToken]), not unique on fcmToken alone).
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        const dead = (r.value as { deadTokens?: string[] }).deadTokens ?? [];
        if (dead.length > 0) {
          await platformPrisma.userDevice.updateMany({
            where: {
              userId,
              fcmToken: { in: dead },
            },
            data: {
              isActive: false,
              lastFailureAt: new Date(),
              lastFailureCode: 'DeviceNotRegistered',
            },
          });
          logger.info('Deactivated dead push tokens', { count: dead.length, userId });
        }
      }
    }

    const expoRes = results[0];
    const fcmRes = results[1];

    if (expoRes?.status === 'fulfilled' && expoRes.value) {
      const v = expoRes.value as {
        messageId: string | null;
        expoTicketId: string | null;
        deadTokens: string[];
      };
      return {
        provider: 'expo',
        messageId: v.messageId,
        expoTicketId: v.expoTicketId,
        deadTokens: v.deadTokens,
      };
    }
    if (fcmRes?.status === 'fulfilled' && fcmRes.value) {
      const v = fcmRes.value as { messageId: string | null; deadTokens: string[] };
      return { provider: 'fcm', messageId: v.messageId, deadTokens: v.deadTokens };
    }

    const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    throw firstErr?.reason ?? Object.assign(new Error('PUSH_ALL_PROVIDERS_FAILED'), { code: 'PUSH_ALL_PROVIDERS_FAILED' });
  },
};
