import { Router } from 'express';
import { tenantController } from './tenant.controller';
import { bulkOnboardController, bulkOnboardUploadMiddleware } from './bulk-onboard.controller';
import { requirePermissions } from '../../middleware/auth.middleware';

const router = Router();

// All tenant routes require super-admin permissions
router.use(requirePermissions(['platform:admin']));

// ── Bulk Onboarding ──────────────────────────────────────────────────
router.get('/bulk/template', bulkOnboardController.downloadTemplate);
router.post('/bulk/validate', bulkOnboardUploadMiddleware, bulkOnboardController.validateUpload);
router.post('/bulk/import', bulkOnboardController.confirmImport);

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
