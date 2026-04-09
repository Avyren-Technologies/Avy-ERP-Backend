import type { NotificationChannel } from '@prisma/client';
import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors';
import { logger } from '../../config/logger';
import { dispatch } from './dispatch/dispatcher';
import { dispatchBulk } from './dispatch/dispatch-bulk';

/**
 * Typed mapping from legacy lowercase channel strings to the Prisma enum.
 * Used by the deprecated `send()` facade to preserve backward compat without
 * an unsafe `as any` cast.
 */
const LEGACY_CHANNEL_MAP: Record<'in_app' | 'push' | 'email', NotificationChannel> = {
  in_app: 'IN_APP',
  push: 'PUSH',
  email: 'EMAIL',
};

/**
 * NotificationService — thin facade. All new callers should use `dispatch()`
 * directly or via this service's `.dispatch` property. The legacy `send()`
 * method is preserved for backward compatibility and internally delegates.
 */
class NotificationService {
  /**
   * Primary API. Exposed as a property so callers can do
   * `notificationService.dispatch({...})`.
   */
  dispatch = dispatch;

  /**
   * Bulk dispatch API. REQUIRED for fanouts ≥20 recipients (payroll, cron, ALL role).
   * Internally chunks + rate limits + dedups + batch-inserts.
   */
  dispatchBulk = dispatchBulk;

  /**
   * Initialize Firebase Admin SDK for FCM web push.
   * Called once at app startup. Safe to call multiple times.
   * If credentials are not configured, FCM is disabled but Expo push + in-app still work.
   */
  async initFirebase(): Promise<void> {
    try {
      const admin = await import('firebase-admin');
      if (!admin.apps.length) {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (serviceAccount) {
          admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(serviceAccount)),
          });
          logger.info('Firebase Admin initialized for push notifications');
        } else {
          logger.warn('FIREBASE_SERVICE_ACCOUNT_KEY not set — FCM web push disabled');
        }
      }
    } catch (err) {
      logger.warn('Firebase Admin init failed', { error: err });
    }
  }

  /**
   * Legacy API — delegates to dispatch(). Preserves the old shape used by
   * a handful of HR listeners so they keep working during the migration.
   */
  async send(params: {
    recipientIds: string[];
    title: string;
    body: string;
    type: string;
    entityType?: string | undefined;
    entityId?: string | undefined;
    channels: Array<'in_app' | 'push' | 'email'>;
    data?: Record<string, unknown> | undefined;
    companyId: string;
  }) {
    return dispatch({
      companyId: params.companyId,
      triggerEvent: params.type,
      entityType: params.entityType,
      entityId: params.entityId,
      explicitRecipients: params.recipientIds,
      tokens: params.data,
      type: params.type,
      adHoc: {
        title: params.title,
        body: params.body,
        channels: params.channels.map((c) => LEGACY_CHANNEL_MAP[c]),
      },
    });
  }

  // ── Device registration ─────────────────────────────────────────────

  async registerDevice(
    userId: string,
    data: {
      platform: string;
      fcmToken: string;
      tokenType?: 'EXPO' | 'FCM_WEB' | 'FCM_NATIVE' | undefined;
      deviceName?: string | undefined;
      deviceModel?: string | undefined;
      osVersion?: string | undefined;
      appVersion?: string | undefined;
      locale?: string | undefined;
      timezone?: string | undefined;
    },
  ) {
    const tokenType =
      data.tokenType ??
      (data.platform === 'WEB' ? 'FCM_WEB' : 'EXPO');

    return platformPrisma.userDevice.upsert({
      where: { userId_fcmToken: { userId, fcmToken: data.fcmToken } },
      create: {
        userId,
        platform: data.platform,
        fcmToken: data.fcmToken,
        tokenType,
        deviceName: data.deviceName ?? null,
        deviceModel: data.deviceModel ?? null,
        osVersion: data.osVersion ?? null,
        appVersion: data.appVersion ?? null,
        locale: data.locale ?? null,
        timezone: data.timezone ?? null,
        isActive: true,
      },
      update: {
        platform: data.platform,
        tokenType,
        deviceName: data.deviceName ?? null,
        deviceModel: data.deviceModel ?? null,
        osVersion: data.osVersion ?? null,
        appVersion: data.appVersion ?? null,
        locale: data.locale ?? null,
        timezone: data.timezone ?? null,
        isActive: true,
        failureCount: 0,
        lastActiveAt: new Date(),
      },
    });
  }

  async unregisterDevice(userId: string, fcmToken: string): Promise<void> {
    await platformPrisma.userDevice.updateMany({
      where: { userId, fcmToken },
      data: { isActive: false },
    });
  }

  // ── Notification queries ────────────────────────────────────────────

  async listNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      platformPrisma.notification.findMany({
        where: { userId, status: { not: 'ARCHIVED' } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      platformPrisma.notification.count({
        where: { userId, status: { not: 'ARCHIVED' } },
      }),
    ]);
    return { notifications, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async markAsRead(userId: string, id: string) {
    const notification = await platformPrisma.notification.findFirst({ where: { id, userId } });
    if (!notification) throw ApiError.notFound('Notification not found');
    return platformPrisma.notification.update({
      where: { id },
      data: { isRead: true, status: 'READ', readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await platformPrisma.notification.updateMany({
      where: { userId, status: 'UNREAD' },
      data: { isRead: true, status: 'READ', readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return platformPrisma.notification.count({ where: { userId, status: 'UNREAD' } });
  }
}

export const notificationService = new NotificationService();
