import { Router } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';

const router = Router();

// Billing module routes
router.get('/subscriptions', requirePermissions(['billing:read']), (req, res) => {
  res.json({ message: 'Subscriptions - TODO: Implement' });
});

router.get('/invoices', requirePermissions(['billing:read']), (req, res) => {
  res.json({ message: 'Invoices - TODO: Implement' });
});

router.post('/invoices/:id/pay', requirePermissions(['billing:update']), (req, res) => {
  res.json({ message: 'Process payment - TODO: Implement' });
});

export { router as billingRoutes };