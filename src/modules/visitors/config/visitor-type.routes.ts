import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { visitorTypeController } from './visitor-type.controller';

const router = Router();

router.get('/', requirePermissions(['visitors:read']), visitorTypeController.list);
router.post('/', requirePermissions(['visitors:configure']), visitorTypeController.create);
router.get('/:id', requirePermissions(['visitors:read']), visitorTypeController.getById);
router.put('/:id', requirePermissions(['visitors:configure']), visitorTypeController.update);
router.patch('/:id/deactivate', requirePermissions(['visitors:configure']), visitorTypeController.deactivate);
router.patch('/:id/activate', requirePermissions(['visitors:configure']), visitorTypeController.activate);
router.delete('/:id', requirePermissions(['visitors:configure']), visitorTypeController.remove);

export { router as visitorTypeRoutes };
