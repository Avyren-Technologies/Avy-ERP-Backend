import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { watchlistController } from './watchlist.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.watchlist:read']), watchlistController.list);
router.post('/', requirePermissions(['visitors.watchlist:create']), watchlistController.create);
router.post('/check', requirePermissions(['visitors.watchlist:read']), watchlistController.check);
router.get('/:id', requirePermissions(['visitors.watchlist:read']), watchlistController.getById);
router.put('/:id', requirePermissions(['visitors.watchlist:update']), watchlistController.update);
router.delete('/:id', requirePermissions(['visitors.watchlist:delete']), watchlistController.remove);

export { router as watchlistRoutes };
