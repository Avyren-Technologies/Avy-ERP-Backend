import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { offerController } from './offer.controller';

const router = Router();

router.get('/', requirePermissions(['recruitment-offer:read', 'hr:read']), offerController.listOffers);
router.post('/', requirePermissions(['recruitment-offer:create', 'hr:create']), offerController.createOffer);
router.get('/:id', requirePermissions(['recruitment-offer:read', 'hr:read']), offerController.getOffer);
router.patch('/:id', requirePermissions(['recruitment-offer:update', 'hr:update']), offerController.updateOffer);
router.patch('/:id/status', requirePermissions(['recruitment-offer:approve', 'hr:update']), offerController.updateOfferStatus);
router.delete('/:id', requirePermissions(['recruitment-offer:delete', 'hr:delete']), offerController.deleteOffer);

export { router as offerRoutes };
