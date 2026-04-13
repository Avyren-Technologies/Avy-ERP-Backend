import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { watchlistController } from './watchlist.controller';

const router = Router();

router.get('/', requirePermissions(['visitors:read']), watchlistController.list);
router.post('/', requirePermissions(['visitors:configure']), watchlistController.create);
router.post('/check', requirePermissions(['visitors:read']), watchlistController.check);
router.get('/:id', requirePermissions(['visitors:read']), watchlistController.getById);
router.put('/:id', requirePermissions(['visitors:configure']), watchlistController.update);
router.delete('/:id', requirePermissions(['visitors:configure']), watchlistController.remove);

export { router as watchlistRoutes };
