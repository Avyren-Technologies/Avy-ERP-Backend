import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { visitorTypeController } from './visitor-type.controller';

const router = Router();

router.get('/', requirePermissions(['visitors:read']), visitorTypeController.list);
router.post('/', requirePermissions(['visitors:configure']), visitorTypeController.create);
router.get('/:id', requirePermissions(['visitors:read']), visitorTypeController.getById);
router.put('/:id', requirePermissions(['visitors:configure']), visitorTypeController.update);
router.delete('/:id', requirePermissions(['visitors:configure']), visitorTypeController.deactivate);

export { router as visitorTypeRoutes };
