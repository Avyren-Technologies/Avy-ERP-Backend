import { Router, Request, Response } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error.middleware';
import { createSuccessResponse } from '../../shared/utils';

const router = Router();

// Maintenance module routes (alias for machines)
router.get('/schedule', requirePermissions(['maintenance:read']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Maintenance schedule - TODO: Implement' }));
}));

router.post('/breakdown', requirePermissions(['maintenance:create']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Report breakdown - TODO: Implement' }));
}));

router.get('/parts', requirePermissions(['maintenance:read']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Spare parts - TODO: Implement' }));
}));

export { router as maintenanceRoutes };