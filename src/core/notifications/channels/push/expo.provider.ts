import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { env } from '../../../../config/env';
import { logger } from '../../../../config/logger';
import type { NotificationPriority, UserDevice } from '@prisma/client';

const expo = new Expo(
  env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : {},
);

export interface ExpoSendPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: NotificationPriority;
}

export interface ExpoSendResult {
  provider: 'expo';
  messageId: string | null;
  expoTicketId: string | null;
  deadTokens: string[];
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

    const deadTokens = all
      .filter(
        (t) =>
          t.ticket?.status === 'error' &&
          (t.ticket as any).details?.error === 'DeviceNotRegistered',
      )
      .map((t) => t.device.fcmToken);

    const ok = all.find((t) => t.ticket?.status === 'ok');
    const firstTicketId = ok?.ticket.status === 'ok' ? (ok.ticket as any).id : null;

    return {
      provider: 'expo',
      messageId: firstTicketId,
      expoTicketId: firstTicketId,
      deadTokens,
    };
  },
};
