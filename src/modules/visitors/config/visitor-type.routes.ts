import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { visitorTypeController } from './visitor-type.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.types:read']), visitorTypeController.list);
router.post('/', requirePermissions(['visitors.types:configure']), visitorTypeController.create);
router.get('/:id', requirePermissions(['visitors.types:read']), visitorTypeController.getById);
router.put('/:id', requirePermissions(['visitors.types:configure']), visitorTypeController.update);
router.patch('/:id/deactivate', requirePermissions(['visitors.types:configure']), visitorTypeController.deactivate);
router.patch('/:id/activate', requirePermissions(['visitors.types:configure']), visitorTypeController.activate);
router.delete('/:id', requirePermissions(['visitors.types:configure']), visitorTypeController.remove);

export { router as visitorTypeRoutes };
