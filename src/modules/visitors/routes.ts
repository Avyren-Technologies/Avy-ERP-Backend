import { Router, Request, Response } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error.middleware';
import { createSuccessResponse } from '../../shared/utils';

const router = Router();

// Visitor management module routes
router.get('/visitors', requirePermissions(['visitors:read']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Visitor list - TODO: Implement' }));
}));

router.post('/checkin', requirePermissions(['visitors:create']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Visitor check-in - TODO: Implement' }));
}));

router.post('/checkout', requirePermissions(['visitors:update']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Visitor check-out - TODO: Implement' }));
}));

export { router as visitorsRoutes };