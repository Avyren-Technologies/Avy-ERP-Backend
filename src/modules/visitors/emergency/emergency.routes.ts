import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { emergencyController } from './emergency.controller';

const router = Router();

router.post('/trigger', requirePermissions(['visitors.emergency:create']), emergencyController.trigger);
router.get('/muster-list', requirePermissions(['visitors.emergency:read']), emergencyController.getMusterList);
router.post('/mark-safe', requirePermissions(['visitors.emergency:create']), emergencyController.markSafe);
router.post('/resolve', requirePermissions(['visitors.emergency:create']), emergencyController.resolve);

export { router as emergencyRoutes };
