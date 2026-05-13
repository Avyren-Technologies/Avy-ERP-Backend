import { Router, Request, Response } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error.middleware';
import { createSuccessResponse } from '../../shared/utils';
import { pipRoutes } from './pip/pip.routes';

const router = Router();

// PIP (Production Incentive Plan) sub-module
router.use('/pip', pipRoutes);

// Production module routes
router.get('/dashboard', requirePermissions(['production:read']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Production dashboard - TODO: Implement OEE metrics' }));
}));

router.post('/logs', requirePermissions(['production:create']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Log production - TODO: Implement' }));
}));

router.get('/scrap', requirePermissions(['production:read']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Scrap tracking - TODO: Implement' }));
}));

export { router as productionRoutes };