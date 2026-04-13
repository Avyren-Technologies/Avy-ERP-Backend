import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { notificationController as controller } from './notification.controller';
import { notificationAnalyticsRoutes } from './analytics/notification-analytics.routes';
import { announcementRoutes } from './announcements/announcement.routes';

const notificationRoutes = Router();

// Sub-routes — mounted first so they don't collide with /:id routes.
notificationRoutes.use('/analytics', notificationAnalyticsRoutes);
notificationRoutes.use('/announcements', announcementRoutes);

// Preferences (must come before /:id/read routes to avoid matching)
notificationRoutes.get('/preferences', controller.getMyPreferences);
notificationRoutes.patch('/preferences', controller.updateMyPreferences);
notificationRoutes.patch('/preferences/categories', controller.updateMyCategoryPreferences);

// Device registration
notificationRoutes.post('/register-device', controller.registerDevice);
notificationRoutes.delete('/register-device', controller.unregisterDevice);

// Test send — rate limited to prevent spam (5/hour per IP+user).
const testLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req: any) => {
    const userId = req.user?.id ?? 'anon';
    return `${req.ip}:${userId}`;
  },
  message: { success: false, message: 'Too many test notifications, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
notificationRoutes.post('/test', testLimiter, controller.sendTestNotification);

// Notification queries
notificationRoutes.get('/', controller.listNotifications);
notificationRoutes.patch('/read-all', controller.markAllAsRead);
notificationRoutes.get('/unread-count', controller.getUnreadCount);
notificationRoutes.patch('/:id/read', controller.markAsRead);
notificationRoutes.patch('/:id/archive', controller.archiveNotification);
notificationRoutes.get('/:id/events', controller.getDeliveryEvents);

export { notificationRoutes };
