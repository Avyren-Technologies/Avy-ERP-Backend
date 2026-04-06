import { Router } from 'express';
import { notificationController as controller } from './notification.controller';

const notificationRoutes = Router();

// Device registration
notificationRoutes.post('/register-device', controller.registerDevice);
notificationRoutes.delete('/register-device', controller.unregisterDevice);

// Notification queries
notificationRoutes.get('/', controller.listNotifications);
notificationRoutes.patch('/read-all', controller.markAllAsRead);
notificationRoutes.get('/unread-count', controller.getUnreadCount);
notificationRoutes.patch('/:id/read', controller.markAsRead);

export { notificationRoutes };
