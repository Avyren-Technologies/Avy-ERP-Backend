import { Router } from 'express';
import { authMiddleware, requirePermissions } from '../middleware/auth.middleware';
import { tenantMiddleware, requireTenant, validateTenantAccess } from '../middleware/tenant.middleware';

// Import core module routes
import { authRoutes } from '../core/auth/auth.routes';
import { tenantRoutes } from '../core/tenant/tenant.routes';
import { rbacRoutes } from '../core/rbac/rbac.routes';
import { companyRoutes } from '../core/company/company.routes';
import { billingRoutes } from '../core/billing/billing.routes';
import { featureToggleRoutes } from '../core/feature-toggle/feature-toggle.routes';

// Import business module routes
import { hrRoutes } from '../modules/hr/routes';
import { productionRoutes } from '../modules/production/routes';
import { machinesRoutes } from '../modules/machines/routes';
import { inventoryRoutes } from '../modules/inventory/routes';
import { visitorsRoutes } from '../modules/visitors/routes';
import { maintenanceRoutes } from '../modules/maintenance/routes';
import { reportsRoutes } from '../modules/reports/routes';

// Create main router
const router = Router();

// Apply tenant middleware to all routes
router.use(tenantMiddleware());

// Health check (no auth required)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
  });
});

// Authentication routes (no tenant required)
router.use('/auth', authRoutes);

// Super-admin only routes (platform level, no tenant context)
router.use(
  '/platform',
  authMiddleware({ requireTenant: false }),
  requirePermissions(['platform:admin'])
);

// Super-admin routes
router.use('/platform/tenants', tenantRoutes);
router.use('/platform/companies', companyRoutes);
router.use('/platform/billing', billingRoutes);

// Tenant-scoped routes (require tenant context)
router.use(
  '/tenants/:tenantId',
  requireTenant(),
  validateTenantAccess
);

// Apply authentication and tenant validation to business routes
router.use(
  authMiddleware({ requireTenant: true }),
  requireTenant(),
  validateTenantAccess
);

// Business module routes
router.use('/hr', hrRoutes);
router.use('/production', productionRoutes);
router.use('/machines', machinesRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/visitors', visitorsRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/reports', reportsRoutes);

// Core tenant routes (for company admins)
router.use('/rbac', rbacRoutes);
router.use('/feature-toggles', featureToggleRoutes);

// API documentation (development only)
if (process.env.NODE_ENV === 'development') {
  // TODO: Add Swagger documentation routes
}

// Export router
export { router as routes };