import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { transferPromotionController } from './transfer.controller';

const router = Router();

// ── Transfers ─────────────────────────────────────────────────────────
router.get('/transfers', requirePermissions(['hr:read']), transferPromotionController.listTransfers);
router.post('/transfers', requirePermissions(['hr:create']), transferPromotionController.createTransfer);
router.get('/transfers/:id', requirePermissions(['hr:read']), transferPromotionController.getTransfer);
router.patch('/transfers/:id/approve', requirePermissions(['hr:update']), transferPromotionController.approveTransfer);
router.patch('/transfers/:id/apply', requirePermissions(['hr:update']), transferPromotionController.applyTransfer);
router.patch('/transfers/:id/reject', requirePermissions(['hr:update']), transferPromotionController.rejectTransfer);
router.patch('/transfers/:id/cancel', requirePermissions(['hr:update']), transferPromotionController.cancelTransfer);

// ── Promotions ────────────────────────────────────────────────────────
router.get('/promotions', requirePermissions(['hr:read']), transferPromotionController.listPromotions);
router.post('/promotions', requirePermissions(['hr:create']), transferPromotionController.createPromotion);
router.get('/promotions/:id', requirePermissions(['hr:read']), transferPromotionController.getPromotion);
router.patch('/promotions/:id/approve', requirePermissions(['hr:update']), transferPromotionController.approvePromotion);
router.patch('/promotions/:id/apply', requirePermissions(['hr:update']), transferPromotionController.applyPromotion);
router.patch('/promotions/:id/reject', requirePermissions(['hr:update']), transferPromotionController.rejectPromotion);
router.patch('/promotions/:id/cancel', requirePermissions(['hr:update']), transferPromotionController.cancelPromotion);

export { router as transferRoutes };
