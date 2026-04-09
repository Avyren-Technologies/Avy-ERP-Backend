import { Request, Response } from 'express';
import { z } from 'zod';
import { notificationService } from './notification.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import { platformPrisma } from '../../config/database';
import { dispatch } from './dispatch/dispatcher';
import { preferencesService } from './preferences/preferences.service';
import { updatePreferencesSchema } from './preferences/preferences.validators';

// ── Validators ────────────────────────────────────────────────────────

const registerDeviceSchema = z.object({
  platform: z.enum(['MOBILE_IOS', 'MOBILE_ANDROID', 'WEB']),
  fcmToken: z.string().min(1, 'FCM token is required'),
  tokenType: z.enum(['EXPO', 'FCM_WEB', 'FCM_NATIVE']).optional(),
  deviceName: z.string().optional(),
  deviceModel: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
});

const unregisterDeviceSchema = z.object({
  fcmToken: z.string().min(1, 'FCM token is required'),
});

// ── Controller ────────────────────────────────────────────────────────

class NotificationController {
  registerDevice = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized('Authentication required');

    const parsed = registerDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const device = await notificationService.registerDevice(userId, parsed.data);
    res.status(201).json(createSuccessResponse(device, 'Device registered'));
  });

  unregisterDevice = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized('Authentication required');

    const parsed = unregisterDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    await notificationService.unregisterDevice(userId, parsed.data.fcmToken);
    res.json(createSuccessResponse(null, 'Device unregistered'));
  });

  listNotifications = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized('Authentication required');

    const { page, limit } = getPaginationParams(req.query);
    const result = await notificationService.listNotifications(userId, page, limit);

    res.json(
      createPaginatedResponse(result.notifications, result.page, result.limit, result.total, 'Notifications retrieved'),
    );
  });

  markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized('Authentication required');

    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Notification ID is required');
    const notification = await notificationService.markAsRead(userId, id);
    res.json(createSuccessResponse(notification, 'Notification marked as read'));
  });

  markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized('Authentication required');

    await notificationService.markAllAsRead(userId);
    res.json(createSuccessResponse(null, 'All notifications marked as read'));
  });

  getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized('Authentication required');

    const count = await notificationService.getUnreadCount(userId);
    res.json(createSuccessResponse({ count }, 'Unread count retrieved'));
  });

  archiveNotification = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized('Authentication required');

    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Notification ID is required');

    const existing = await platformPrisma.notification.findFirst({ where: { id, userId } });
    if (!existing) throw ApiError.notFound('Notification not found');

    const updated = await platformPrisma.notification.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    res.json(createSuccessResponse(updated, 'Notification archived'));
  });

  getDeliveryEvents = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized('Authentication required');

    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Notification ID is required');

    const existing = await platformPrisma.notification.findFirst({ where: { id, userId } });
    if (!existing) throw ApiError.notFound('Notification not found');

    const events = await platformPrisma.notificationEvent.findMany({
      where: { notificationId: id },
      orderBy: { occurredAt: 'asc' },
    });
    res.json(createSuccessResponse(events));
  });

  sendTestNotification = asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user?.id) throw ApiError.unauthorized();
    if (!user.companyId) throw ApiError.badRequest('User has no company context');

    const result = await dispatch({
      companyId: user.companyId,
      triggerEvent: 'TEST_NOTIFICATION',
      explicitRecipients: [user.id],
      adHoc: {
        title: 'Test Notification',
        body: 'This is a test notification to verify your preferences are working.',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        priority: 'MEDIUM',
      },
      type: 'TEST',
    });
    res.json(createSuccessResponse(result, 'Test notification dispatched'));
  });

  getMyPreferences = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized();
    const result = await preferencesService.getForUser(userId);
    res.json(createSuccessResponse(result));
  });

  updateMyPreferences = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.unauthorized();
    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }
    const result = await preferencesService.update(userId, parsed.data);
    res.json(createSuccessResponse(result, 'Preferences updated'));
  });
}

export const notificationController = new NotificationController();
