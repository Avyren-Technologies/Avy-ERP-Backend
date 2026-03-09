import { Router, Request, Response } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error.middleware';
import { createSuccessResponse } from '../../shared/utils';

const router = Router();

// Inventory module routes
router.get('/stock', requirePermissions(['inventory:read']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Stock levels - TODO: Implement' }));
}));

router.post('/receipt', requirePermissions(['inventory:create']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Goods receipt - TODO: Implement' }));
}));

router.post('/issue', requirePermissions(['inventory:create']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Material issue - TODO: Implement' }));
}));

export { router as inventoryRoutes };