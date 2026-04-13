import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { emergencyController } from './emergency.controller';

const router = Router();

router.post('/trigger', requirePermissions(['visitors:configure']), emergencyController.trigger);
router.get('/muster-list', requirePermissions(['visitors:read']), emergencyController.getMusterList);
router.post('/mark-safe', requirePermissions(['visitors:create']), emergencyController.markSafe);
router.post('/resolve', requirePermissions(['visitors:configure']), emergencyController.resolve);

export { router as emergencyRoutes };
