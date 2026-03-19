import { Router } from 'express';
import { billingController } from './billing.controller';

const router = Router();

// All billing routes are mounted under /platform/billing
// which already has platform:admin permission from the main router

// Revenue summary KPIs
router.get('/summary', billingController.getBillingSummary);

// List invoices (paginated, filterable by status)
router.get('/invoices', billingController.listInvoices);

// Monthly revenue chart data
router.get('/revenue-chart', billingController.getRevenueChart);

export { router as billingRoutes };
