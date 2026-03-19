import { Router } from 'express';
import { paymentController } from './payment.controller';

const router = Router();

// All payment routes are mounted under /platform/billing/payments
// which already has platform:admin permission from the main router

// List payments (paginated, filterable by companyId, invoiceId, method, dateFrom, dateTo)
router.get('/', paymentController.listPayments);

// Get single payment by ID
router.get('/:id', paymentController.getPaymentById);

// Record a new payment against an invoice
router.post('/record', paymentController.recordPayment);

export { router as paymentRoutes };
