import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { announcementController } from './announcement.controller';

const announcementRoutes = Router();

// POST /notifications/announcements — guarded by hr:configure
announcementRoutes.post(
  '/',
  requirePermissions(['hr:configure']),
  announcementController.send,
);

export { announcementRoutes };
