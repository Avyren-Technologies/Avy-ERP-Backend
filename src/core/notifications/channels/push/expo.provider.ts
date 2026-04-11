import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { env } from '../../../../config/env';
import { logger } from '../../../../config/logger';
import { platformPrisma } from '../../../../config/database';
import type { NotificationPriority, UserDevice } from '@prisma/client';

const MAX_FAILURE_COUNT = 5;

const expo = new Expo(
  env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : {},
);

export interface ExpoSendPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: NotificationPriority;
  /** Optional image URL for rich push (Android BigPicture / iOS media attachment). */
  imageUrl?: string | undefined;
}

export interface ExpoSendResult {
  provider: 'expo';
  messageId: string | null;
  expoTicketId: string | null;
  deadTokens: string[];
  successDeviceIds: string[];
  failedDeviceIds: string[];
}

export const expoProvider = {
  async send(devices: UserDevice[], payload: ExpoSendPayload, traceId: string): Promise<ExpoSendResult> {
    const validDevices = devices.filter((d) => Expo.isExpoPushToken(d.fcmToken));
    if (validDevices.length === 0) {
      throw Object.assign(new Error('NO_VALID_EXPO_TOKENS'), { code: 'NO_VALID_EXPO_TOKENS' });
    }

    const messages: ExpoPushMessage[] = validDevices.map((d) => ({
      to: d.fcmToken,
      title: payload.title,
      body: payload.body,
      data: { ...payload.data, traceId },
      priority:
        payload.priority === 'CRITICAL' || payload.priority === 'HIGH' ? 'high' : 'default',
      sound: 'default',
      channelId: payload.priority === 'CRITICAL' ? 'critical' : 'default',
      badge: 1,
      // Rich content — shows a large image in the expanded notification
      // on both Android (BigPictureStyle) and iOS (media attachment).
      // expo-server-sdk v6+ supports richContent.image.
      ...(payload.imageUrl ? { richContent: { image: payload.imageUrl } } : {}),
    }));

    const chunks = expo.chunkPushNotifications(messages);
    const all: Array<{ device: UserDevice; ticket: ExpoPushTicket }> = [];

    let offset = 0;
    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        const chunkDevices = validDevices.slice(offset, offset + chunk.length);
        for (let i = 0; i < tickets.length; i++) {
          const t = tickets[i];
          const d = chunkDevices[i];
          if (t && d) all.push({ device: d, ticket: t });
        }
        offset += chunk.length;
      } catch (err) {
        logger.error('Expo sendPushNotificationsAsync chunk failed', { error: err, traceId });
        throw err;
      }
    }

    const deadTokens: string[] = [];
    const successDeviceIds: string[] = [];
    const failedDeviceIds: string[] = [];

    for (const { device, ticket } of all) {
      if (ticket?.status === 'ok') {
        successDeviceIds.push(device.id);
      } else if (ticket?.status === 'error') {
        const errCode = (ticket as { details?: { error?: string } }).details?.error;
        failedDeviceIds.push(device.id);
        if (errCode === 'DeviceNotRegistered') {
          deadTokens.push(device.fcmToken);
        }
      }
    }

    // Lifecycle updates: increment failureCount for failed devices, reset for successes.
    if (successDeviceIds.length > 0) {
      await platformPrisma.userDevice.updateMany({
        where: { id: { in: successDeviceIds } },
        data: { failureCount: 0, lastSuccessAt: new Date() },
      });
    }
    if (failedDeviceIds.length > 0) {
      // Increment failureCount atomically. Devices hitting MAX_FAILURE_COUNT are
      // soft-deactivated by the caller (push.channel.ts).
      for (const deviceId of failedDeviceIds) {
        try {
          await platformPrisma.userDevice.update({
            where: { id: deviceId },
            data: {
              failureCount: { increment: 1 },
              lastFailureAt: new Date(),
            },
          });
        } catch (err) {
          logger.warn('Failed to increment device failure count', { error: err, deviceId });
        }
      }
      // Cap-and-deactivate any that hit the threshold
      await platformPrisma.userDevice.updateMany({
        where: { id: { in: failedDeviceIds }, failureCount: { gte: MAX_FAILURE_COUNT } },
        data: { isActive: false },
      });
    }

    const ok = all.find((t) => t.ticket?.status === 'ok');
    const firstTicketId =
      ok?.ticket.status === 'ok' ? ((ok.ticket as { id?: string }).id ?? null) : null;

    return {
      provider: 'expo',
      messageId: firstTicketId,
      expoTicketId: firstTicketId,
      deadTokens,
      successDeviceIds,
      failedDeviceIds,
    };
  },
};
