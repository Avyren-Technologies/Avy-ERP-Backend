import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { deniedEntryController } from './denied-entry.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.denied-entries:read']), deniedEntryController.list);
router.get('/:id', requirePermissions(['visitors.denied-entries:read']), deniedEntryController.getById);

export { router as deniedEntryRoutes };
