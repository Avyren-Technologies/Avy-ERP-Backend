import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors';
import { logger } from '../../config/logger';

interface SendNotificationParams {
  recipientIds: string[];
  title: string;
  body: string;
  type: string;
  entityType?: string;
  entityId?: string;
  channels: ('in_app' | 'push' | 'email')[];
  data?: Record<string, any>;
  companyId: string;
}

class NotificationService {
  private firebaseAdmin: typeof import('firebase-admin') | null = null;

  /**
   * Initialize Firebase Admin SDK.
   * Called once at app startup. If firebase credentials are not configured,
   * push notifications are disabled but in-app notifications still work.
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
          this.firebaseAdmin = admin;
          logger.info('Firebase Admin initialized for push notifications');
        } else {
          logger.warn('FIREBASE_SERVICE_ACCOUNT_KEY not set — push notifications disabled');
        }
      } else {
        this.firebaseAdmin = admin;
      }
    } catch (err) {
      logger.warn('Firebase Admin not available — push notifications disabled', { error: err });
    }
  }

  /**
   * Send notification to one or more users.
   * Creates in-app notification records AND sends FCM push if configured.
   */
  async send(params: SendNotificationParams): Promise<void> {
    const { recipientIds, title, body, type, entityType, entityId, channels, data, companyId } = params;

    // In-app notifications
    if (channels.includes('in_app')) {
      await platformPrisma.notification.createMany({
        data: recipientIds.map((userId) => ({
          userId,
          title,
          body,
          type,
          entityType: entityType ?? null,
          entityId: entityId ?? null,
          ...(data ? { data } : {}),
          companyId,
        })),
      });
    }

    // FCM push notifications
    if (channels.includes('push') && this.firebaseAdmin) {
      await this.sendPush(recipientIds, title, body, { type, entityType, entityId, ...data });
    }
  }

  private async sendPush(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, any>,
  ): Promise<void> {
    try {
      const devices = await platformPrisma.userDevice.findMany({
        where: { userId: { in: userIds } },
      });

      if (devices.length === 0) return;

      const messaging = this.firebaseAdmin!.messaging();
      const tokens = devices.map((d) => d.fcmToken);

      // Build data payload — FCM data values must be strings
      const stringData = Object.fromEntries(
        Object.entries(data)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      );

      const response = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: stringData,
        tokens,
      });

      // Clean up invalid tokens
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          const token = tokens[idx];
          if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered' && token) {
            failedTokens.push(token);
          }
        });
        if (failedTokens.length > 0) {
          await platformPrisma.userDevice.deleteMany({
            where: { fcmToken: { in: failedTokens } },
          });
        }
      }
    } catch (err) {
      logger.error('FCM push failed', { error: err });
      // Don't throw — push failure shouldn't break the main flow
    }
  }

  // ── Device Registration ─────────────────────────────────────────────

  async registerDevice(userId: string, data: { platform: string; fcmToken: string; deviceName?: string | undefined }) {
    return platformPrisma.userDevice.upsert({
      where: { userId_fcmToken: { userId, fcmToken: data.fcmToken } },
      create: {
        userId,
        platform: data.platform,
        fcmToken: data.fcmToken,
        deviceName: data.deviceName ?? null,
      },
      update: {
        platform: data.platform,
        deviceName: data.deviceName ?? null,
        lastActiveAt: new Date(),
      },
    });
  }

  async unregisterDevice(userId: string, fcmToken: string): Promise<void> {
    await platformPrisma.userDevice.deleteMany({
      where: { userId, fcmToken },
    });
  }

  // ── Notification Queries ────────────────────────────────────────────

  async listNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      platformPrisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      platformPrisma.notification.count({ where: { userId } }),
    ]);
    return { notifications, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async markAsRead(userId: string, id: string) {
    const notification = await platformPrisma.notification.findFirst({ where: { id, userId } });
    if (!notification) throw ApiError.notFound('Notification not found');
    return platformPrisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await platformPrisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return platformPrisma.notification.count({ where: { userId, isRead: false } });
  }
}

export const notificationService = new NotificationService();
