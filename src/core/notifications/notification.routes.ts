import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { notificationController as controller } from './notification.controller';

const notificationRoutes = Router();

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
