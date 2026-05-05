import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { vmsConfigController } from './vms-config.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.settings:read']), vmsConfigController.get);
router.put('/', requirePermissions(['visitors.settings:configure']), vmsConfigController.update);

export { router as vmsConfigRoutes };
