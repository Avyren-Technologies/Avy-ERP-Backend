import { Router } from 'express';
import { billingController } from './billing.controller';
import { billingConfigRoutes } from './billing-config.routes';
import { paymentRoutes } from './payment.routes';
import { invoiceRoutes } from './invoice.routes';
import { subscriptionRoutes } from './subscription.routes';

const router = Router();

// All billing routes are mounted under /platform/billing
// which already has platform:admin permission from the main router

// Revenue summary KPIs
router.get('/summary', billingController.getBillingSummary);

// Monthly revenue chart data
router.get('/revenue-chart', billingController.getRevenueChart);

// Invoice sub-routes (replaces old GET /invoices)
router.use('/invoices', invoiceRoutes);

// Billing config sub-routes
router.use('/config', billingConfigRoutes);

// Payment sub-routes
router.use('/payments', paymentRoutes);

// Subscription sub-routes
router.use('/subscriptions', subscriptionRoutes);

export { router as billingRoutes };
