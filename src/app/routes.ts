import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env';
import { authMiddleware, requirePermissions } from '../middleware/auth.middleware';
import { tenantMiddleware, requireTenant, validateTenantAccess } from '../middleware/tenant.middleware';
import { buildOpenApiSpec } from './openapi';

// Import core module routes
import { authRoutes } from '../core/auth/auth.routes';
import { tenantRoutes } from '../core/tenant/tenant.routes';
import { rbacRoutes } from '../core/rbac/rbac.routes';
import { rbacController } from '../core/rbac/rbac.controller';
import { companyRoutes } from '../core/company/company.routes';
import { billingRoutes } from '../core/billing/billing.routes';
import { dashboardPlatformRoutes, dashboardTenantRoutes } from '../core/dashboard/dashboard.routes';
import { auditRoutes } from '../core/audit/audit.routes';
import { companyAdminRoutes } from '../core/company-admin/company-admin.routes';
import { supportCompanyRoutes, supportPlatformRoutes } from '../core/support/support.routes';

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

// API documentation (gated by ENABLE_SWAGGER env)
if (env.ENABLE_SWAGGER) {
  router.get('/openapi.json', (_req, res) => {
    res.status(200).json(buildOpenApiSpec(router));
  });

  router.use('/docs', swaggerUi.serve);
  router.get(
    '/docs',
    swaggerUi.setup(undefined, {
      explorer: true,
      customSiteTitle: `${env.APP_NAME} API Docs`,
      swaggerOptions: {
        url: `${env.API_PREFIX}/openapi.json`,
        persistAuthorization: true,
      },
    })
  );
}

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
router.use('/platform/dashboard', dashboardPlatformRoutes);
router.use('/platform/audit-logs', auditRoutes);
router.use('/platform/support', supportPlatformRoutes);

// Tenant-scoped routes (require tenant context)
router.use(
  '/tenants/:tenantId',
  requireTenant(),
  validateTenantAccess()
);

// Module catalogue (accessible by BOTH super-admin and company-admin, no tenant required)
router.get('/modules/catalogue', authMiddleware({ requireTenant: false }), async (req, res) => {
  const { MODULE_CATALOGUE } = await import('../core/billing/pricing.service');
  const companyId = req.user?.companyId;

  if (companyId) {
    // Company admin — show with active/inactive status
    const { companyAdminService } = await import('../core/company-admin/company-admin.service');
    const result = await companyAdminService.getModuleCatalogue(companyId);
    return res.json({ success: true, data: result, message: 'Module catalogue retrieved' });
  }

  // Super admin — show full catalogue, all modules
  const catalogue = MODULE_CATALOGUE.map((mod: any) => ({
    id: mod.id,
    name: mod.name,
    pricePerMonth: mod.price,
    isActive: true, // super admin sees all as available
  }));
  return res.json({ success: true, data: { catalogue }, message: 'Module catalogue retrieved' });
});

// Navigation manifest (accessible by BOTH super-admin and company users, no tenant required)
router.get(
  '/rbac/navigation-manifest',
  authMiddleware({ requireTenant: false }),
  rbacController.getNavigationManifest
);

// Apply authentication and tenant validation to business routes
router.use(
  authMiddleware({ requireTenant: true }),
  requireTenant(),
  validateTenantAccess()
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
router.use('/dashboard', dashboardTenantRoutes);
router.use('/rbac', rbacRoutes);
router.use('/company', companyAdminRoutes);
router.use('/company/support', supportCompanyRoutes);

// Export router
export { router as routes };