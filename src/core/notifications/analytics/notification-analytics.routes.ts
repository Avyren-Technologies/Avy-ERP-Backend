import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { notificationAnalyticsController as controller } from './notification-analytics.controller';

const notificationAnalyticsRoutes = Router();

// All analytics endpoints require hr:configure (admin-only).
notificationAnalyticsRoutes.get(
  '/summary',
  requirePermissions(['hr:configure']),
  controller.getSummary,
);
notificationAnalyticsRoutes.get(
  '/top-failing',
  requirePermissions(['hr:configure']),
  controller.getTopFailing,
);
notificationAnalyticsRoutes.get(
  '/delivery-trend',
  requirePermissions(['hr:configure']),
  controller.getDeliveryTrend,
);

export { notificationAnalyticsRoutes };
