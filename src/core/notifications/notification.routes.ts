import { Router } from 'express';
import { notificationController as controller } from './notification.controller';

const notificationRoutes = Router();

// Preferences (must come before /:id/read routes to avoid matching)
notificationRoutes.get('/preferences', controller.getMyPreferences);
notificationRoutes.patch('/preferences', controller.updateMyPreferences);

// Device registration
notificationRoutes.post('/register-device', controller.registerDevice);
notificationRoutes.delete('/register-device', controller.unregisterDevice);

// Test send
notificationRoutes.post('/test', controller.sendTestNotification);

// Notification queries
notificationRoutes.get('/', controller.listNotifications);
notificationRoutes.patch('/read-all', controller.markAllAsRead);
notificationRoutes.get('/unread-count', controller.getUnreadCount);
notificationRoutes.patch('/:id/read', controller.markAsRead);
notificationRoutes.patch('/:id/archive', controller.archiveNotification);
notificationRoutes.get('/:id/events', controller.getDeliveryEvents);

export { notificationRoutes };
