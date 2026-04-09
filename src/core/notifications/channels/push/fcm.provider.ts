import * as admin from 'firebase-admin';
import { logger } from '../../../../config/logger';
import { platformPrisma } from '../../../../config/database';
import type { NotificationPriority, UserDevice } from '@prisma/client';

const MAX_FAILURE_COUNT = 5;

/**
 * Serialize an arbitrary JS value for FCM's string-only data payload.
 * Primitives become their string form; objects/arrays become JSON strings
 * so clients can reparse, rather than getting "[object Object]".
 */
function fcmStringify(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

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
  successDeviceIds: string[];
  failedDeviceIds: string[];
}

export const fcmProvider = {
  async send(devices: UserDevice[], payload: FcmSendPayload, traceId: string): Promise<FcmSendResult> {
    if (!admin.apps.length) {
      throw Object.assign(new Error('FIREBASE_NOT_INITIALIZED'), { code: 'FIREBASE_NOT_INITIALIZED' });
    }
    const messaging = admin.messaging();

    // Preserve device alignment: only keep devices whose fcmToken is set.
    const validDevices = devices.filter((d) => !!d.fcmToken);
    if (validDevices.length === 0) {
      throw Object.assign(new Error('NO_FCM_TOKENS'), { code: 'NO_FCM_TOKENS' });
    }
    const tokens = validDevices.map((d) => d.fcmToken);

    const stringData = Object.fromEntries(
      Object.entries({ ...payload.data, traceId })
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, fcmStringify(v)]),
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
      const successDeviceIds: string[] = [];
      const failedDeviceIds: string[] = [];

      response.responses.forEach((r, idx) => {
        const device = validDevices[idx];
        if (!device) return;
        if (r.success) {
          successDeviceIds.push(device.id);
        } else {
          failedDeviceIds.push(device.id);
          const code = (r.error as { code?: string })?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            deadTokens.push(device.fcmToken);
          }
        }
      });

      // Lifecycle updates
      if (successDeviceIds.length > 0) {
        await platformPrisma.userDevice.updateMany({
          where: { id: { in: successDeviceIds } },
          data: { failureCount: 0, lastSuccessAt: new Date() },
        });
      }
      if (failedDeviceIds.length > 0) {
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
        await platformPrisma.userDevice.updateMany({
          where: { id: { in: failedDeviceIds }, failureCount: { gte: MAX_FAILURE_COUNT } },
          data: { isActive: false },
        });
      }

      const firstOk = response.responses.find((r) => r.success);
      return {
        provider: 'fcm',
        messageId: firstOk?.messageId ?? null,
        deadTokens,
        successDeviceIds,
        failedDeviceIds,
      };
    } catch (err) {
      logger.error('FCM sendEachForMulticast failed', { error: err, traceId });
      throw err;
    }
  },
};
