import { Router } from 'express';
import { appVersionController as controller } from './app-version.controller';

// ── Public routes (no auth) ──────────────────────────────────
export const appVersionPublicRoutes = Router();
appVersionPublicRoutes.get('/check', controller.checkVersion);

// ── Admin routes (super admin only, mounted under /platform) ─
export const appVersionAdminRoutes = Router();
appVersionAdminRoutes.get('/', controller.list);
appVersionAdminRoutes.post('/', controller.upsert);
appVersionAdminRoutes.get('/by-platform/:platform', controller.getByPlatform);
appVersionAdminRoutes.patch('/:id', controller.update);
appVersionAdminRoutes.delete('/:id', controller.delete);
