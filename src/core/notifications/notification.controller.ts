import { Request, Response } from 'express';
import { z } from 'zod';
import { notificationService } from './notification.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';

// ── Validators ────────────────────────────────────────────────────────

const registerDeviceSchema = z.object({
  platform: z.enum(['MOBILE_IOS', 'MOBILE_ANDROID', 'WEB']),
  fcmToken: z.string().min(1, 'FCM token is required'),
  deviceName: z.string().optional(),
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
}

export const notificationController = new NotificationController();
