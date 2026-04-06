import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { offerController } from './offer.controller';

const router = Router();

router.get('/', requirePermissions(['hr:read']), offerController.listOffers);
router.post('/', requirePermissions(['hr:create']), offerController.createOffer);
router.get('/:id', requirePermissions(['hr:read']), offerController.getOffer);
router.patch('/:id', requirePermissions(['hr:update']), offerController.updateOffer);
router.patch('/:id/status', requirePermissions(['hr:update']), offerController.updateOfferStatus);
router.delete('/:id', requirePermissions(['hr:delete']), offerController.deleteOffer);

export default router;
