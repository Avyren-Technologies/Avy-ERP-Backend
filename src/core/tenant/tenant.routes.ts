import { Router } from 'express';
import { tenantController } from './tenant.controller';
import { requirePermissions } from '../../middleware/auth.middleware';

const router = Router();

// All tenant routes require super-admin permissions
router.use(requirePermissions(['platform:admin']));

// ── Onboarding ────────────────────────────────────────────────────────
router.post('/onboard', tenantController.onboardTenant);

// ── Company detail & section updates ──────────────────────────────────
router.get('/company/:companyId/detail', tenantController.getFullCompanyDetail);
router.patch('/company/:companyId/section/:sectionKey', tenantController.updateCompanySection);
router.patch('/company/:companyId/status', tenantController.updateCompanyStatus);
router.delete('/company/:companyId', tenantController.deleteCompany);

// ── Existing tenant management routes ─────────────────────────────────
router.post('/', tenantController.createTenant);
router.get('/', tenantController.listTenants);
router.get('/stats', tenantController.getTenantStats);
router.get('/:tenantId', tenantController.getTenant);
router.put('/:tenantId', tenantController.updateTenant);
router.delete('/:tenantId', tenantController.deleteTenant);

// Get tenant by company ID
router.get('/company/:companyId', tenantController.getTenantByCompany);

export { router as tenantRoutes };
