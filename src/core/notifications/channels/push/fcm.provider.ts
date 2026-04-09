import * as admin from 'firebase-admin';
import { logger } from '../../../../config/logger';
import type { NotificationPriority, UserDevice } from '@prisma/client';

export interface FcmSendPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: NotificationPriority;
}

export interface FcmSendResult {
  provider: 'fcm';
  messageId: string | null;
  deadTokens: string[];
}

export const fcmProvider = {
  async send(devices: UserDevice[], payload: FcmSendPayload, traceId: string): Promise<FcmSendResult> {
    if (!admin.apps.length) {
      throw Object.assign(new Error('FIREBASE_NOT_INITIALIZED'), { code: 'FIREBASE_NOT_INITIALIZED' });
    }
    const messaging = admin.messaging();
    const tokens = devices.map((d) => d.fcmToken).filter((t): t is string => !!t);
    if (tokens.length === 0) {
      throw Object.assign(new Error('NO_FCM_TOKENS'), { code: 'NO_FCM_TOKENS' });
    }

    const stringData = Object.fromEntries(
      Object.entries({ ...payload.data, traceId })
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)]),
    );

    try {
      const response = await messaging.sendEachForMulticast({
        notification: { title: payload.title, body: payload.body },
        data: stringData,
        tokens,
        android: {
          priority: payload.priority === 'CRITICAL' || payload.priority === 'HIGH' ? 'high' : 'normal',
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
        webpush: {
          notification: { title: payload.title, body: payload.body, icon: '/favicon.ico' },
        },
      });

      const deadTokens: string[] = [];
      response.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = (r.error as any)?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            const t = tokens[idx];
            if (t) deadTokens.push(t);
          }
        }
      });

      const firstOk = response.responses.find((r) => r.success);
      return {
        provider: 'fcm',
        messageId: firstOk?.messageId ?? null,
        deadTokens,
      };
    } catch (err) {
      logger.error('FCM sendEachForMulticast failed', { error: err, traceId });
      throw err;
    }
  },
};
