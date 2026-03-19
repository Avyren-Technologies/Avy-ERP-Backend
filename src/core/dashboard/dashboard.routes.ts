import { Router } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { dashboardController } from './dashboard.controller';

// ── Platform-level routes (super-admin only) ─────────────────────────
// Mounted at /platform/dashboard — inherits platform:admin guard from routes.ts
const platformRouter = Router();
platformRouter.get('/stats', dashboardController.getSuperAdminStats);
platformRouter.get('/activity', dashboardController.getRecentActivity);
platformRouter.get('/revenue', dashboardController.getRevenueMetrics);

// ── Tenant-scoped routes (company-admin) ─────────────────────────────
// Mounted at /dashboard — inherits tenant auth guard from routes.ts
const tenantRouter = Router();
tenantRouter.get('/company-stats', dashboardController.getCompanyAdminStats);

export { platformRouter as dashboardPlatformRoutes, tenantRouter as dashboardTenantRoutes };
